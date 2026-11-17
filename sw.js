// Çevrimdışı oynama için önbellek (service worker)
const CACHE = 'otodunya-v2';
const CORE = ["./","./css/style.css","./icon.svg","./index.html","./js/audio.js","./js/camera.js","./js/carModel.js","./js/chests.js","./js/core.js","./js/data/cars.js","./js/data/content.js","./js/data/missions.js","./js/effects.js","./js/game.js","./js/hud.js","./js/human.js","./js/i18n.js","./js/i18n_en.js","./js/input.js","./js/main.js","./js/missions.js","./js/render.js","./js/save.js","./js/settings.js","./js/traffic.js","./js/ui/shop.js","./js/ui/stage.js","./js/ui/ui.js","./js/vehicle.js","./js/world/builder.js","./js/world/geo.js","./js/world/graph.js","./js/world/maps.js","./js/world/textures.js","./js/world/world.js","./lib/addons/environments/RoomEnvironment.js","./lib/addons/objects/Sky.js","./lib/addons/postprocessing/BokehPass.js","./lib/addons/postprocessing/EffectComposer.js","./lib/addons/postprocessing/MaskPass.js","./lib/addons/postprocessing/OutputPass.js","./lib/addons/postprocessing/Pass.js","./lib/addons/postprocessing/RenderPass.js","./lib/addons/postprocessing/SMAAPass.js","./lib/addons/postprocessing/ShaderPass.js","./lib/addons/postprocessing/UnrealBloomPass.js","./lib/addons/shaders/BokehShader.js","./lib/addons/shaders/CopyShader.js","./lib/addons/shaders/FXAAShader.js","./lib/addons/shaders/LuminosityHighPassShader.js","./lib/addons/shaders/OutputShader.js","./lib/addons/shaders/SMAAShader.js","./lib/addons/shaders/VignetteShader.js","./lib/addons/utils/BufferGeometryUtils.js","./lib/three.module.min.js","./manifest.json"];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const net = fetch(e.request).then((res) => {
        if (res && res.ok && new URL(e.request.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
