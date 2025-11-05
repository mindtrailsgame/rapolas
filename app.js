document.addEventListener('DOMContentLoaded', () => {

    // --- Story Data ---
    let storyData = {};

    // --- DOM Elements (Supaprastinta) ---
    const dom = {
        screens: document.querySelectorAll('.screen'),
        gameScreen: document.getElementById('game-screen'),
        gameContent: document.getElementById('game-content'),
        dialogueContainer: document.getElementById('dialogue-container'),
        npcDialogue: document.getElementById('npc-dialogue'),
        dialogueHistory: document.getElementById('dialogue-history'),
        dialogueScrollContent: document.querySelector('.dialogue-scroll-content'),
        currentDialogueWrapper: document.getElementById('current-dialogue-wrapper'),
        playerDialogue: document.getElementById('player-dialogue'),
        npcName: document.getElementById('npc-name'),
        npcText: document.getElementById('npc-text'),
        choiceIndicator: document.getElementById('choice-indicator'),
        playerResponseText: document.getElementById('player-response-text'),
        responseDots: document.getElementById('response-dots'),
        qrScanScreen: document.getElementById('qr-scan-screen'),
        qrReader: document.getElementById('qr-reader'),
        scanQrBtn: document.getElementById('scan-qr-btn'),
        cancelScanBtn: document.getElementById('cancel-scan-btn'),

        loadingOverlay: document.getElementById('loading-overlay'),
        loadingText: document.getElementById('loading-text')
    };

    // --- Game State ---
    let gameState = {};
    const STORAGE_KEY = 'rapolasGameState'; // Pakeistas raktas, kad nesimaišytų su senu
    let touchStartX = 0;
    let touchEndX = 0;
    let touchStartY = 0; 
    let touchEndY = 0;
    let touchStartScrollTop = 0;
    let html5QrCode = null;
    let onCacheCompleteCallback = null;
    const voicePlayer = new Audio();


// --- HELPER FUNCTIONS ---

    function setAppHeight() {
        const doc = document.documentElement;
        const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        doc.style.setProperty('--app-height', `${viewportHeight}px`);
    }

    function showToast(message) {
        const toast = document.getElementById('toast-notification');
        if (!toast) return;
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    // --- HELPER FUNCTIONS ---

    function showLoadingScreen(message) {
        dom.loadingText.textContent = message;
        dom.loadingOverlay.classList.add('is-visible');
    }

    function hideLoadingScreen() {
        dom.loadingOverlay.classList.remove('is-visible');
    }

    // Funkcija, kuri surinks visus reikiamus garso failus
    function getAudioUrlsForNpc(npcId) {
        const urls = [];
        const lowerNpcId = npcId.toLowerCase();
        
        for (const nodeId in storyData) {
            // Tikriname, ar mazgas priklauso šiam NPC
            if (nodeId.startsWith(npcId + '_')) {
                const node = storyData[nodeId];
                // Tikriname, ar tai NPC tekstas (ne žaidėjo ir ne tuščias)
                if (node.text !== null && (!node.npc || node.npc.toUpperCase() !== "YOU")) {
                    const audioSrc = `audio/${lowerNpcId}/${nodeId}.mp3`;
                    urls.push(audioSrc);
                }
            }
        }
        console.log(`Radau ${urls.length} garso failus ${npcId}.`);
        return urls;
    }

    function handleSwipe() {
        const swipeThreshold = 50;
        if (touchEndX < touchStartX - swipeThreshold) cycleChoice(1);
        if (touchEndX > touchStartX + swipeThreshold) cycleChoice(-1);
    }
    
    // --- SERVICE WORKER FUNCTIONS ---

    // Ši funkcija klausysis pranešimų IŠ sw.js
    function handleSwMessage(event) {
        if (event.data && event.data.type === 'CACHE_COMPLETE') {
            console.log(`[App] SW patvirtino, kad ${event.data.npcId} failai paruošti.`);
            hideLoadingScreen();
            if (onCacheCompleteCallback) {
                onCacheCompleteCallback();
            }
        } else if (event.data && event.data.type === 'CACHE_ERROR') {
            console.warn(`[App] SW klaida talpinant ${event.data.npcId} failus:`, event.data.error);
            showToast("Klaida paruošiant failus. Garsas gali neveikti.");
            hideLoadingScreen();
            // Vis tiek tęsiame, net jei nepavyko
            if (onCacheCompleteCallback) {
                onCacheCompleteCallback();
            }
        }
        onCacheCompleteCallback = null;
    }

    // Ši funkcija užregistruos sw.js failą
    function registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then((registration) => {
                    console.log('Service Worker užregistruotas sėkmingai:', registration.scope);
                    // Pradedame klausytis pranešimų iš SW
                    navigator.serviceWorker.addEventListener('message', handleSwMessage);
                })
                .catch((error) => {
                    console.error('Service Worker registracija nepavyko:', error);
                });
        } else {
            console.warn('Service Worker nėra palaikomas šioje naršyklėje.');
        }
    }
    
    // --- QR SCANNER FUNCTIONS ---

    // Pridėkite 'async' prie šios funkcijos
    async function onScanSuccess(decodedText, decodedResult) {
        console.log(`Nuskaitytas kodas: ${decodedText}`);

        // Naudojame .then() ir .catch(), nes stopQrScan grąžina Promise
        stopQrScan().then(async () => { // Pridėkite 'async' čia
            if (storyData[`${decodedText}_intro`]) {
                showScreen('game-screen'); 
                await startConversation(decodedText); // Naudokite 'await' čia
            } else {
                console.warn(`Nuskaitytas QR kodas "${decodedText}" nėra galiojantis.`);
                showToast(`"${decodedText}" nėra atpažintas.`);
                showScreen('game-screen');
            }
        }).catch(async (err) => { // Pridėkite 'async' čia
            console.error("Klaida stabdant skaitytuvą po sėkmės:", err);
            if (storyData[`${decodedText}_intro`]) {
                showScreen('game-screen');
                await startConversation(decodedText); // Ir 'await' čia
            }
        });
    }

    function onScanFailure(error) {
        // Paliekame tuščią
    }

    function startQrScan() {
        showScreen('qr-scan-screen');
        
        setTimeout(() => {
            const config = {
                fps: 10,
                qrbox: { width: 250, height: 250 }
            };

            html5QrCode.start(
                { facingMode: "environment" },
                config,
                onScanSuccess,
                onScanFailure
            ).catch(err => {
                console.error("Nepavyko paleisti QR skaitytuvo", err);
                showToast("Nepavyko paleisti kameros.");
                showScreen('game-screen');
            });
        }, 100);
    }

    function stopQrScan() {
        return html5QrCode.stop().then(() => {
            console.log("QR skaitytuvas sustabdytas.");
            showScreen('game-screen');
        }).catch(err => {
            console.warn("QR skaitytuvo stabdymas nepavyko, bet tęsiame.", err);
            showScreen('game-screen');
        });
    }

    // Balso įrašų funkcija lieka (ji veiks, jei įdėsite audio/rapolas/RAPOLAS_intro.mp3 ir t.t.)
    function playVoiceLine(nodeId) {
        if (voicePlayer && !voicePlayer.paused) {
            voicePlayer.pause();
            voicePlayer.currentTime = 0;
        }

        const node = storyData[nodeId];
        if (!node || node.text === null || !node.npc || node.npc === "YOU") {
            return;
        }

        const nodeIdPrefix = nodeId.split('_')[0]; 
        const folderName = nodeIdPrefix.toLowerCase(); 
        const audioSrc = `audio/${folderName}/${nodeId}.mp3`;

        voicePlayer.src = audioSrc;
        const playPromise = voicePlayer.play();

        if (playPromise !== undefined) {
            playPromise.catch(error => {
                if (error.name === "NotSupportedError") {
                    console.log(`Balso failas nerastas: ${audioSrc}`);
                } else {
                    console.error(`Garso klaida mazgui ${nodeId}:`, error);
                }
            });
        }
    }

    function initializeQrScanner() {
        html5QrCode = new Html5Qrcode("qr-reader");
        
        // Padarykite šią funkciją 'async'
        dom.scanQrBtn.addEventListener('click', startQrScan);

        dom.cancelScanBtn.addEventListener('click', stopQrScan);
    }

    function advanceMonologue() {
        if (!gameState.currentConversation) return false;
        
        const node = storyData[gameState.currentConversation.currentNode];
        if (!node) return false;

        const isMonologueNode = node.choices.length === 1 && node.choices[0].text === '...';

        if (isMonologueNode) {
            gameState.currentConversation.history.push({ 
                speaker: (node.npc || gameState.currentConversation.npcId).toUpperCase(), 
                text: node.text 
            });
            
            const nextNodeId = node.choices[0].target_node;
            renderNode(nextNodeId, true, true, null, null);
            return true;
        }
        
        return false;
    }

    function cycleChoice(direction) {
        const allDots = Array.from(dom.responseDots.querySelectorAll('.response-dot:not(.used)'));
        if (allDots.length <= 1) return;
        const currentIndex = allDots.findIndex(dot => dot.classList.contains('active'));
        let newIndex = (currentIndex + direction + allDots.length) % allDots.length;
        allDots[newIndex].click();
    }

    // --- CORE GAME FUNCTIONS (Supaprastinta) ---

    function showScreen(screenId) {
        dom.screens.forEach(s => s.classList.toggle('active', s.id === screenId));
    }

    function saveGameState() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(gameState));
        console.log("Game saved! 💾", gameState);
    }

    function loadGameState() {
        const savedStateJSON = localStorage.getItem(STORAGE_KEY);
        if (savedStateJSON) {
            gameState = JSON.parse(savedStateJSON);
            console.log("Found saved game. Loading... ✨", gameState);

            // Užtikriname, kad 'progress' egzistuoja
            if (!gameState.progress) {
                gameState.progress = {};
            }

            // Jei buvome vidury pokalbio, jį atstatome
            if (gameState.currentConversation) {
                renderNode(gameState.currentConversation.currentNode);
            }
            return true;
        }
        console.log("No saved game found.");
        return false;
    }


    // --- DIALOGUE FUNCTIONS ---

    function handleDialogueSwipe() {
        const swipeThreshold = 50;
        if (touchEndY > touchStartY + swipeThreshold) {
            dom.dialogueContainer.classList.add('is-expanded');
        }
        if (touchEndY < touchStartY - swipeThreshold) {
            advanceDialogue();
        }
    }

    function advanceDialogue() {
        if (!gameState.currentConversation) return;
        const currentNode = storyData[gameState.currentConversation.currentNode];
        if (!currentNode) return;

        // Prioritetas 1: is_chain_link
        if (currentNode.is_chain_link) {
            const validChoice = currentNode.choices.find(choice => !choice.condition || checkCondition(choice.condition));
            if (validChoice) {
                const nextNodeId = validChoice.target_node;
                let preselectedChoiceData = null;
                let keepChoicesVisibleOnNextNode = false; 
                const nextNode = storyData[nextNodeId];
                const isNextNodeAMonologue = nextNode && nextNode.choices.length === 1 && nextNode.choices[0].text === '...';

                if (nextNode && nextNode.choices && nextNode.choices.length > 0 && !nextNode.is_chain_link && !isNextNodeAMonologue) {
                    const firstValidChoiceOfNextNode = nextNode.choices.find(c => !c.condition || checkCondition(c.condition));
                    if (firstValidChoiceOfNextNode) {
                        let choiceText = '';
                        if (Array.isArray(firstValidChoiceOfNextNode.text)) {
                            const validTextObject = firstValidChoiceOfNextNode.text.find(t => t.condition ? checkCondition(t.condition) : true) || firstValidChoiceOfNextNode.text[firstValidChoiceOfNextNode.text.length - 1];
                            choiceText = validTextObject.value;
                        } else {
                            choiceText = firstValidChoiceOfNextNode.text;
                        }
                        
                        preselectedChoiceData = {
                            text: choiceText,
                            target_node: firstValidChoiceOfNextNode.target_node,
                            set_flag: firstValidChoiceOfNextNode.set_flag || '',
                            keep_visible: firstValidChoiceOfNextNode.keep_choices_visible || 'false'
                        };
                        keepChoicesVisibleOnNextNode = true; 
                    }
                }
                renderNode(nextNodeId, keepChoicesVisibleOnNextNode, true, null, preselectedChoiceData);
                return;
            } else {
                console.error(`Chain link node "${gameState.currentConversation.currentNode}" has no valid path.`);
            }
        }

        // Prioritetas 2: Monologas
        const isMonologueNode = currentNode.choices.length === 1 && currentNode.choices[0].text === '...';
        if (isMonologueNode) {
            gameState.currentConversation.history.push({ 
                speaker: (currentNode.npc || gameState.currentConversation.npcId).toUpperCase(), 
                text: currentNode.text 
            });
            const nextNodeId = currentNode.choices[0].target_node;
            const nextNode = storyData[nextNodeId];
            let keepChoicesVisibleOnNextNode = false;
            if (nextNode && !nextNode.is_chain_link && (nextNode.choices.length > 1 || (nextNode.choices.length === 1 && nextNode.choices[0].text !== '...'))) {
                keepChoicesVisibleOnNextNode = true;
            }
            renderNode(nextNodeId, keepChoicesVisibleOnNextNode, true, null, null);
            return;
        }

        // Prioritetas 3: Numatytasis elgesys
        if (dom.playerDialogue.classList.contains('is-hidden')) {
            dom.playerDialogue.classList.remove('is-hidden');
            dom.choiceIndicator.classList.remove('is-visible');
        } else {
            dom.dialogueContainer.classList.remove('is-expanded');
        }
    }

    // Supaprastinta: nebereikia tikrinti DAUMANTAS, DARKO ir t.t.
    // Padarome funkciją ASINCHRONINE su 'async'
    async function startConversation(npcId) {
        
        // 1. Parodome įkėlimo ekraną
        showLoadingScreen(`Kraunami ${npcId} duomenys...`);
        
        // 2. Surenkame garso failų URL
        const audioUrls = getAudioUrlsForNpc(npcId);

        // 3. Tikriname, ar turime ką siųsti į Service Worker
        if (audioUrls.length > 0 && navigator.serviceWorker.controller) {
            console.log(`[App] Siunčiama užklausa į SW talpinti ${npcId} garso failus.`);
            
            // Sukuriame pažadą (Promise), kuris lauks, kol SW atsiųs atsakymą
            const cachePromise = new Promise((resolve) => {
                // Kai SW atsiųs pranešimą 'CACHE_COMPLETE',
                // handleSwMessage funkcija iškvies šį 'resolve'
                onCacheCompleteCallback = resolve;
            });

            // Išsiunčiame pranešimą Į sw.js
            navigator.serviceWorker.controller.postMessage({
                type: 'CACHE_AUDIO',
                npcId: npcId,
                urls: audioUrls
            });

            // Laukiame, kol pažadas bus išpildytas (iki 30 sekundžių)
            await Promise.race([
                cachePromise,
                new Promise(resolve => setTimeout(resolve, 30000)) // Timeout
            ]);

        } else if (audioUrls.length === 0) {
            console.log('[App] Nėra garso failų talpinimui.');
        } else if (!navigator.serviceWorker.controller) {
            console.warn('[App] Service Worker dar neaktyvus. Praleidžiama talpykla.');
        }

        // 4. Paslepiame įkėlimo ekraną (jei SW dar to nepadarė)
        hideLoadingScreen();

        // --- Tęsiame su likusia, jūsų originalia, startConversation logika ---
        
        if (!gameState.progress[npcId]) { gameState.progress[npcId] = {}; }

        let startNode = `${npcId}_intro`; 

        if (npcId === 'RAPOLAS' && gameState.progress.RAPOLAS?.rapolas_alive_met === true) {
             startNode = 'RAPOLAS_re_entry';
        }
        
        gameState.currentConversation = {
            npcId: npcId,
            currentNode: startNode,
            history: [], 
            keyStatements: []
        };

        dom.gameContent.style.display = 'none';
        dom.dialogueContainer.classList.add('is-active');
        dom.playerDialogue.classList.add('is-active');

        renderNode(gameState.currentConversation.currentNode, false, false, null, null);
    }
    function renderHistory() {
        dom.dialogueHistory.innerHTML = '';
        if (!gameState.currentConversation || !gameState.currentConversation.history) return;
        gameState.currentConversation.history.forEach(entry => {
            const p = document.createElement('p');
            p.classList.add('history-entry', entry.speaker === 'player' ? 'player-line' : 'npc-line');
            const speakerName = entry.speaker === 'player' ? 'YOU' : entry.speaker;
            p.textContent = `${speakerName} - "${entry.text}"`;
            dom.dialogueHistory.appendChild(p);
        });
    }

    // Supaprastinta: pašalinta 'is_key_statement' logika
    function renderNode(nodeId, keepChoicesVisible = false, isAnimated = false, questionContext = null, preselectedChoiceData = null) {
        const node = storyData[nodeId];
        if (!node) {
            console.error(`Node "${nodeId}" not found!`);
            return;
        }

        // Supaprastinta: nebereikia 'is_key_statement'

        if (node.set_flag) {
            const [key, value] = node.set_flag.split('=').map(s => s.trim());
            const npcId = gameState.currentConversation.npcId;
            let processedValue = (value === 'true') ? true : (value === 'false') ? false : value;
            
            // Užtikriname, kad progress objektas egzistuoja
            if (!gameState.progress[npcId]) {
                 gameState.progress[npcId] = {};
            }
            
            gameState.progress[npcId][key] = processedValue;
            console.log(`Flag set by node '${nodeId}': ${npcId}.${key} = ${processedValue}`);
        }

        gameState.currentConversation.currentNode = nodeId;
        playVoiceLine(nodeId);
        saveGameState();
        renderHistory();

        if (node.is_end) {
            endConversation();
            return; 
        }

        if (node.text !== null) {
            const npcName = (node.npc || gameState.currentConversation.npcId).toUpperCase();
            const dialogueText = node.text.replace(/(?<!\w)'|'(?!\w)/g, '"');
            const newHtml = `<span class="npc-prefix">${npcName} – </span>${dialogueText}`;

            if (isAnimated) {
                const oldTextEl = dom.npcText;
                const newTextEl = document.createElement('p');
                newTextEl.id = 'npc-text';
                newTextEl.innerHTML = newHtml;
                newTextEl.classList.add('is-entering');
                const wrapper = dom.currentDialogueWrapper;
                wrapper.appendChild(newTextEl);
                wrapper.insertBefore(newTextEl, dom.choiceIndicator);
                void newTextEl.offsetHeight;
                oldTextEl.classList.add('is-exiting');
                newTextEl.classList.remove('is-entering');
                dom.npcText = newTextEl;
                oldTextEl.addEventListener('transitionend', () => oldTextEl.remove(), { once: true });
            } else {
                dom.npcText.innerHTML = newHtml;
            }
        }
        
        if (keepChoicesVisible) {
            dom.playerDialogue.classList.remove('is-hidden');
        } else {
            dom.playerDialogue.classList.add('is-hidden');
        }

        dom.responseDots.innerHTML = '';

        if (preselectedChoiceData) {
            const processedText = preselectedChoiceData.text.replace(/(?<!\w)'|'(?!\w)/g, '"');
            dom.playerResponseText.innerHTML = `<span class.="player-prefix">YOU – </span>${processedText}`;
            dom.playerResponseText.dataset.targetNode = preselectedChoiceData.target_node;
            dom.playerResponseText.dataset.setFlag = preselectedChoiceData.set_flag;
            dom.playerResponseText.dataset.keepVisible = preselectedChoiceData.keep_visible;
        } else {
            dom.playerResponseText.innerHTML = '';
            dom.playerResponseText.dataset.targetNode = '';
        }
        
        if (!node.is_chain_link) {
            node.choices.forEach((choice) => {
                if (choice.condition && !checkCondition(choice.condition)) {
                    return; 
                }
                const dot = document.createElement('div');
                dot.classList.add('response-dot');

                if (choice.set_flag) {
                    const [key, value] = choice.set_flag.split('=').map(s => s.trim());
                    const npcId = gameState.currentConversation.npcId;
                    if (gameState.progress[npcId] && gameState.progress[npcId][key] === true) {
                        dot.classList.add('used');
                    }
                }
                
                let choiceText = '';
                if (Array.isArray(choice.text)) {
                    const validTextObject = choice.text.find(t => t.condition ? checkCondition(t.condition) : true) || choice.text[choice.text.length - 1];
                    choiceText = validTextObject.value;
                } else {
                    choiceText = choice.text;
                }

                dot.dataset.text = choiceText;
                dot.dataset.targetNode = choice.target_node;
                dot.dataset.setFlag = choice.set_flag || '';
                dot.dataset.keepVisible = choice.keep_choices_visible || 'false';
                
                dot.addEventListener('click', () => {
                    document.querySelectorAll('.response-dot.active').forEach(d => d.classList.remove('active'));
                    dot.classList.add('active');
                    const playerText = dot.dataset.text.replace(/(?<!\w)'|'(?!\w)/g, '"');
                    dom.playerResponseText.innerHTML = `<span class="player-prefix">YOU – </span>${playerText}`;
                    dom.playerResponseText.dataset.targetNode = dot.dataset.targetNode;
                    dom.playerResponseText.dataset.setFlag = dot.dataset.setFlag;
                    dom.playerResponseText.dataset.keepVisible = dot.dataset.keepVisible;
                });
                dom.responseDots.appendChild(dot);
            });

            if (!preselectedChoiceData) {
                let firstDotToActivate = dom.responseDots.querySelector('.response-dot:not(.used)');
                if (!firstDotToActivate) {
                    firstDotToActivate = dom.responseDots.querySelector('.response-dot');
                }
                if (firstDotToActivate) {
                    firstDotToActivate.click();
                }
            } else {
                const firstDot = dom.responseDots.querySelector('.response-dot');
                if(firstDot) firstDot.classList.add('active');
            }
        }

        dom.dialogueContainer.classList.remove('is-expanded');
        dom.choiceIndicator.classList.remove('is-visible');
        const choicesAreHidden = dom.playerDialogue.classList.contains('is-hidden');
        const isCurrentNodeMonologue = node.choices.length === 1 && node.choices[0].text === '...';
        
        if (choicesAreHidden) {
            if (isCurrentNodeMonologue) {
                const nextNodeId = node.choices[0].target_node;
                const nextNode = storyData[nextNodeId];
                if (nextNode) {
                    const isNextNodeMonologue = (nextNode.choices.length === 1 && nextNode.choices[0].text === '...');
                    if (!isNextNodeMonologue) {
                        dom.choiceIndicator.classList.add('is-visible');
                    }
                }
            } else if (!node.is_chain_link && node.choices.length > 0) {
                dom.choiceIndicator.classList.add('is-visible');
            }
        }
    }

    function confirmChoice() {
        const targetNode = dom.playerResponseText.dataset.targetNode;
        const flagToSet = dom.playerResponseText.dataset.setFlag;
        const keepVisible = dom.playerResponseText.dataset.keepVisible === 'true'; 
        if (!targetNode) return;

        let questionContext = null;

        if (gameState.currentConversation) {
            const node = storyData[gameState.currentConversation.currentNode];
            if (node && node.text !== null) {
                const npcName = (node.npc || gameState.currentConversation.npcId).toUpperCase();
                const npcText = node.text; 
                gameState.currentConversation.history.push({ speaker: npcName, text: npcText });
            }
            const activeDot = dom.responseDots.querySelector('.response-dot.active');
            if (activeDot) {
                const playerText = activeDot.dataset.text;
                gameState.currentConversation.history.push({ speaker: 'player', text: playerText });
                questionContext = playerText;
            }
        }

        if (flagToSet) {
            const [key, value] = flagToSet.split('=').map(s => s.trim());
            const npcId = gameState.currentConversation.npcId;
            let processedValue;
            if (value === 'true') processedValue = true;
            else if (value === 'false') processedValue = false;
            else processedValue = value;
            
            if (!gameState.progress[npcId]) gameState.progress[npcId] = {};
            gameState.progress[npcId][key] = processedValue;
            console.log(`Flag set by choice: ${npcId}.${key} = ${processedValue}`);
        }
        renderNode(targetNode, keepVisible, false, questionContext, null);
    }

    // Patikrinimo funkcija lieka nepakitusi, ji reikalinga vėliavėlėms
    function checkCondition(conditionString) {
        if (!conditionString) return true;
        const npcId = gameState.currentConversation.npcId;
        const conditions = conditionString.split('&&').map(s => s.trim());
        
        for (const condition of conditions) {
            let operator;
            let parts;
            if (condition.includes('!=')) {
                operator = '!=';
                parts = condition.split('!=').map(s => s.trim());
            } else if (condition.includes('==')) {
                operator = '==';
                parts = condition.split('==').map(s => s.trim());
            } else {
                console.error(`Neteisingas sąlygos formatas: "${condition}"`);
                return false;
            }
            if (parts.length !== 2) {
                console.error(`Neteisingas sąlygos formatas: "${condition}"`);
                return false; 
            }
            const key = parts[0];
            const valueToCompare = parts[1];
            const flagValue = gameState.progress[npcId]?.[key] ?? false;
            let processedValueToCompare;
            if (valueToCompare === 'true') processedValueToCompare = true;
            else if (valueToCompare === 'false') processedValueToCompare = false;
            else processedValueToCompare = valueToCompare;
            let conditionMet = false;
            if (operator === '==') conditionMet = (flagValue === processedValueToCompare);
            else if (operator === '!=') conditionMet = (flagValue !== processedValueToCompare);
            if (!conditionMet) return false;
        }
        return true;
    }

    // Supaprastinta: nebeišsaugome bylų
    function endConversation() {
        showToast("Conversation ended.");

        // Nebereikia išsaugoti 'caseFiles'
        
        saveGameState(); // Išsaugome progresą (pvz., 'rapolas_alive_met')
        gameState.currentConversation = null;

        dom.dialogueContainer.classList.remove('is-active', 'is-expanded');
        dom.playerDialogue.classList.remove('is-active');
        dom.gameContent.style.display = 'flex'; // Parodome pagrindinį ekraną su fonu
    }

    // Supaprastinta: pašalinti visi nereikalingi mygtukai
    function initializeApp() {

        registerServiceWorker();
       
        // Event Listeners
        dom.playerResponseText.addEventListener('click', confirmChoice);
        dom.choiceIndicator.addEventListener('click', advanceDialogue);
        
        initializeQrScanner();

        // Horizontal swipe for choices
        dom.playerDialogue.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; }, { passive: true });
        dom.playerDialogue.addEventListener('touchend', e => { touchEndX = e.changedTouches[0].screenX; handleSwipe(); }, { passive: true });

        // Vertical swipe for accordion panel
        dom.dialogueContainer.addEventListener('touchstart', e => { touchStartY = e.changedTouches[0].screenY; }, { passive: true });
        dom.dialogueContainer.addEventListener('touchend', e => { touchEndY = e.changedTouches[0].screenY; handleDialogueSwipe(); }, { passive: true });


        setAppHeight();

        window.addEventListener('resize', setAppHeight);
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', setAppHeight);
        }
        
        // Nauja paleidimo logika
        const hasSave = loadGameState();
        
        if (!hasSave) {
            // Sukuriame tuščią būseną, jei nėra išsaugotos
            gameState = {
                progress: {},
                currentConversation: null,
            };
            saveGameState();
        }

        // Jei nesame vidury pokalbio, rodome pagrindinį ekraną
        
            showScreen('game-screen');
        
        // Jei ESAME vidury pokalbio, loadGameState() jau iškvietė renderNode()
        // ir dialogas bus automatiškai parodytas.
    }

    // Įkeliame istoriją ir paleidžiame programėlę
    fetch('story.json')
        .then(response => response.json())
        .then(data => {
            storyData = data;
            console.log("Story data loaded successfully! 📖");
            initializeApp();
        })
        .catch(error => {
            console.error('CRITICAL ERROR: Could not load story.json.', error);
            alert("Failed to load story data. The app cannot start.");
        });
});

