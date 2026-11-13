// Bouton « Partager » en haut à droite : QR code, WhatsApp ou lien. Pages /v2/ uniquement.
(function () {
  "use strict";
  var p = location.pathname, q = new URLSearchParams(location.search);
  var e92 = p.indexOf("/v2/92") === 0 || q.get("e2c") === "92";
  var cle = e92 ? "e2c92" : "e2c93";
  var lien = "https://kit.djimenezapps.com/" + cle;
  var nom = e92 ? "E2C 92" : "E2C 93";
  var texte = "Le Kit de prospection de l'" + nom + " : plus de stages pour les jeunes et de nouvelles ressources pour l'école. " + lien;

  var css = document.createElement("style");
  css.textContent =
    ".pt-btn{flex:none;order:3;align-self:center;display:inline-flex;align-items:center;gap:7px;min-height:40px;padding:0 14px;border:1px solid #d1d5db;border-radius:10px;background:#fff;color:#13294b;font:inherit;font-weight:600;font-size:.9rem;cursor:pointer}" +
    ".pt-btn:hover{border-color:#13294b}.pt-btn svg{width:18px;height:18px}" +
    "@media (max-width:699px){.pt-btn span{display:none}.pt-btn{padding:0;width:40px;justify-content:center}}" +
    ".pt-back{position:fixed;inset:0;z-index:2000;background:rgba(17,24,39,.45);display:none;align-items:flex-start;justify-content:flex-end;padding:68px 16px 16px}" +
    ".pt-back.on{display:flex}" +
    "@media (max-width:699px){.pt-back{align-items:flex-end;justify-content:center;padding:0}}" +
    ".pt-box{background:#fff;border-radius:16px;width:min(340px,100%);padding:18px;box-shadow:0 18px 40px rgba(17,24,39,.25);font-family:Inter,system-ui,sans-serif;color:#111827}" +
    "@media (max-width:699px){.pt-box{width:100%;border-radius:20px 20px 0 0;padding:20px 16px 24px}}" +
    ".pt-h{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}.pt-h b{font-size:1.02rem}" +
    ".pt-x{border:0;background:#f1f3f6;border-radius:50%;width:34px;height:34px;font-size:1.2rem;line-height:1;cursor:pointer;color:#374151}" +
    ".pt-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:12px}" +
    ".pt-tabs button{min-height:40px;border:1px solid #e5e7eb;border-radius:10px;background:#fff;font:inherit;font-weight:600;font-size:.88rem;color:#374151;cursor:pointer}" +
    ".pt-tabs button.on{background:#13294b;border-color:#13294b;color:#fff}" +
    ".pt-pane{display:none;text-align:center}.pt-pane.on{display:block}" +
    ".pt-pane img{width:220px;height:220px;max-width:100%;display:block;margin:0 auto 8px;image-rendering:pixelated}" +
    ".pt-url{font-size:.86rem;color:#13294b;font-weight:600;word-break:break-all}" +
    ".pt-pane p{margin:6px 0 12px;font-size:.88rem;color:#4b5563}" +
    ".pt-go{display:flex;width:100%;min-height:46px;align-items:center;justify-content:center;gap:8px;border:0;border-radius:10px;font:inherit;font-weight:600;cursor:pointer;text-decoration:none}" +
    ".pt-wa{background:#25d366;color:#fff}.pt-cp{background:#e8541c;color:#fff}";
  document.head.appendChild(css);

  var ico = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>';
  var btn = document.createElement("button");
  btn.type = "button"; btn.className = "pt-btn"; btn.setAttribute("aria-haspopup", "dialog");
  btn.innerHTML = ico + "<span>Partager</span>"; btn.setAttribute("aria-label", "Partager le Kit");
  var top = document.querySelector(".top-in");
  if (!top) return;
  top.appendChild(btn);

  var back = document.createElement("div");
  back.className = "pt-back";
  back.innerHTML =
    '<div class="pt-box" role="dialog" aria-modal="true" aria-label="Partager le Kit">' +
    '<div class="pt-h"><b>Partager le Kit · ' + nom + '</b><button type="button" class="pt-x" aria-label="Fermer">×</button></div>' +
    '<div class="pt-tabs" role="tablist"><button type="button" class="on" data-t="qr">QR code</button><button type="button" data-t="wa">WhatsApp</button><button type="button" data-t="ln">Lien</button></div>' +
    '<div class="pt-pane on" data-p="qr"><img src="/v2/qr-' + cle + '.png" alt="QR code vers ' + lien + '"><div class="pt-url">' + lien.replace("https://", "") + '</div><p>À scanner avec l\'appareil photo du téléphone.</p></div>' +
    '<div class="pt-pane" data-p="wa"><p>Envoie le lien avec un court message.</p><a class="pt-go pt-wa" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(texte) + '">Ouvrir WhatsApp</a></div>' +
    '<div class="pt-pane" data-p="ln"><div class="pt-url" style="margin:4px 0 12px">' + lien + '</div><button type="button" class="pt-go pt-cp">Copier le lien</button></div>' +
    "</div>";
  document.body.appendChild(back);

  var ouvrir = function () { back.classList.add("on"); back.querySelector(".pt-x").focus(); };
  var fermer = function () { back.classList.remove("on"); btn.focus(); };
  btn.addEventListener("click", ouvrir);
  back.addEventListener("click", function (e) { if (e.target === back) fermer(); });
  back.querySelector(".pt-x").addEventListener("click", fermer);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && back.classList.contains("on")) fermer(); });
  Array.prototype.forEach.call(back.querySelectorAll(".pt-tabs button"), function (b) {
    b.addEventListener("click", function () {
      var t = b.getAttribute("data-t");
      Array.prototype.forEach.call(back.querySelectorAll(".pt-tabs button"), function (x) { x.classList.toggle("on", x === b); });
      Array.prototype.forEach.call(back.querySelectorAll(".pt-pane"), function (x) { x.classList.toggle("on", x.getAttribute("data-p") === t); });
    });
  });
  var cp = back.querySelector(".pt-cp");
  cp.addEventListener("click", function () {
    var ok = function () { cp.textContent = "Lien copié ✓"; setTimeout(function () { cp.textContent = "Copier le lien"; }, 2200); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(lien).then(ok, function () { window.prompt("Copier le lien :", lien); });
    else window.prompt("Copier le lien :", lien);
  });
})();
