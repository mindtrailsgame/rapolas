// sw.js (Service Worker)

const APP_SHELL_CACHE = 'app-shell-v1';
const DYNAMIC_CACHE = 'dynamic-content-v1';

// 1. Failai, reikalingi, kad programėlė veiktų (App Shell)
const appShellFiles = [
    'rapolas/index.html',
    'rapolas/style.css',
    'rapolas/app.js',
    'rapolas/story.json',
    'rapolas/bakcground_image.jpg', // Iš jūsų CSS
    'https://unpkg.com/html5-qrcode@2.3.8/dist/html5-qrcode.min.js'
];

// --- GYVAVIMO CIKLO ĮVYKIAI ---

// 1. ĮDIEGIMAS (INSTALL)
// Iškviečiamas, kai Service Worker yra įdiegiamas pirmą kartą.
self.addEventListener('install', (event) => {
    console.log('[SW] Installation...');
    event.waitUntil(
        caches.open(APP_SHELL_CACHE)
            .then((cache) => {
                console.log('[SW] Talpinami "App Shell" failai...');
                // addAll iš karto bando parsiųsti ir išsaugoti visus failus
                return cache.addAll(appShellFiles);
            })
            .catch(err => {
                console.error('[SW] Nepavyko talpinti "App Shell":', err);
            })
    );
    self.skipWaiting(); // Priverčia naują SW tapti aktyviu iš karto
});

// 2. AKTYVAVIMAS (ACTIVATE)
// Iškviečiamas, kai Service Worker yra aktyvuojamas (pvz., pakeitus versiją)
self.addEventListener('activate', (event) => {
    console.log('[SW] Being activated...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    // Ištriname senas talpyklas, kurios nesutampa su dabartinėmis
                    if (cacheName !== APP_SHELL_CACHE && cacheName !== DYNAMIC_CACHE) {
                        console.log('[SW] Trinama sena talpykla:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    return self.clients.claim(); // Perima visų atidarytų langų kontrolę
});

// 3. GAVIMAS (FETCH)
// Iškviečiamas KIEKVIENĄ kartą, kai programėlė bando gauti resursą (vaizdą, JS, garso failą)
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    // 1. Radome talpykloje (Cache Hit)
                    // Grąžiname failą iš talpyklos iš karto.
                    return cachedResponse;
                }
                
                // 2. Neradome talpykloje (Cache Miss)
                // Einame į tinklą ir bandome parsiųsti.
                return fetch(event.request);
            })
    );
});


// --- KOMUNIKACIJOS ĮVYKIAI ---

// 4. PRANEŠIMAS (MESSAGE)
// Klausomės pranešimų iš app.js
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'CACHE_AUDIO') {
        const { npcId, urls } = event.data;
        console.log(`[SW] I got a request to upload ${urls.length} sound files...`);

        event.waitUntil(
            caches.open(DYNAMIC_CACHE)
                .then((cache) => {
                    // cache.addAll yra "viskas arba nieko". Jei bent vienas failas
                    // nepasiekiamas, visa operacija žlugs.
                    return cache.addAll(urls);
                })
                .then(() => {
                    console.log(`[SW] Succesfully uploaded ${npcId} sound files.`);
                    // Siunčiame pranešimą atgal į app.js, kad baigėme
                    event.source.postMessage({ type: 'CACHE_COMPLETE', npcId: npcId });
                })
                .catch((err) => {
                    console.error('[SW] Error while uploading sound files:', err, urls);
                    // Pranešame apie klaidą, kad app.js galėtų paslėpti įkėlimo ekraną
                    event.source.postMessage({ type: 'CACHE_ERROR', npcId: npcId, error: err.message });
                })
        );
    }

});

