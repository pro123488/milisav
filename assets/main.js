/* Inmobiliaria Bosch · comportamiento de la página */
(function () {
  "use strict";

  /* ==========================================================
     Valores iniciales del simulador (puedes cambiarlos aquí)
     rate = tasa de referencia en % efectivo anual (E.A.).
     Es solo un punto de partida: cada persona puede modificarla.
     ========================================================== */
  var SIM = { locale: "es-CO", currency: "COP", value: 320000000, pct: 70, years: 20, rate: 12 };

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  // El número de WhatsApp se toma de los enlaces de index.html (un solo lugar que cambiar).
  var waLink = $('a[href^="https://wa.me/"]');
  var WA_NUMBER = waLink ? (waLink.getAttribute("href").match(/wa\.me\/(\d+)/) || [])[1] : "";

  function waUrl(text) {
    return "https://wa.me/" + WA_NUMBER + "?text=" + encodeURIComponent(text);
  }

  /* ---------- Encabezado ---------- */
  var header = $(".site-header");
  var toggle = $(".nav-toggle");
  var nav = $("#menu");

  function onScroll() {
    header.classList.toggle("is-scrolled", window.scrollY > 24);
  }
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  function setMenu(open) {
    header.classList.toggle("menu-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
  }
  toggle.addEventListener("click", function () {
    setMenu(!header.classList.contains("menu-open"));
  });
  $$("a", nav).forEach(function (a) {
    a.addEventListener("click", function () { setMenu(false); });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && header.classList.contains("menu-open")) {
      setMenu(false);
      toggle.focus();
    }
  });
  window.matchMedia("(min-width: 1024px)").addEventListener("change", function (e) {
    if (e.matches) setMenu(false);
  });

  /* ---------- Año del pie ---------- */
  var year = $("#year");
  if (year) year.textContent = new Date().getFullYear();

  /* ---------- Simulador de cuota ---------- */
  var elValue = $("#s-value");
  var elPct = $("#s-pct");
  var elTerm = $("#s-term");
  var elRate = $("#s-rate");
  var outPct = $("#s-pct-out");
  var outTerm = $("#s-term-out");
  var outPay = $("#s-payment");
  var outLoan = $("#s-loan");
  var outDown = $("#s-down");
  var simCta = $("#sim-cta");

  var fmtMoney = new Intl.NumberFormat(SIM.locale, { style: "currency", currency: SIM.currency, maximumFractionDigits: 0 });
  var fmtNumber = new Intl.NumberFormat(SIM.locale, { maximumFractionDigits: 0 });
  var simCtaDefault = simCta.getAttribute("href");

  // Cuota fija mensual (sistema francés) con tasa efectiva anual convertida a mensual.
  function monthlyPayment(principal, years, effectiveAnnualPct) {
    var n = years * 12;
    var i = Math.pow(1 + effectiveAnnualPct / 100, 1 / 12) - 1;
    if (i <= 0) return principal / n;
    return (principal * i) / (1 - Math.pow(1 + i, -n));
  }

  function paintRange(input) {
    var min = Number(input.min), max = Number(input.max);
    input.style.setProperty("--fill", ((Number(input.value) - min) / (max - min)) * 100 + "%");
  }

  function readValue() {
    return Number((elValue.value || "").replace(/\D/g, "")) || 0;
  }

  function updateSim() {
    var value = readValue();
    var pct = Number(elPct.value);
    var years = Number(elTerm.value);
    var rate = parseFloat(String(elRate.value).replace(",", "."));
    var rateOk = isFinite(rate) && rate >= 0;
    if (rateOk) rate = Math.min(rate, 60);

    outPct.textContent = pct + "%";
    outTerm.textContent = years + " años (" + years * 12 + " meses)";
    paintRange(elPct);
    paintRange(elTerm);

    if (!value || !rateOk) {
      outPay.textContent = "—";
      outLoan.textContent = "—";
      outDown.textContent = "—";
      simCta.setAttribute("href", simCtaDefault);
      return;
    }

    var loan = Math.round(value * pct / 100);
    var down = value - loan;
    var pay = Math.round(monthlyPayment(loan, years, rate));

    outPay.textContent = fmtMoney.format(pay);
    outLoan.textContent = fmtMoney.format(loan);
    outDown.textContent = fmtMoney.format(down);

    simCta.setAttribute("href", waUrl(
      "Hola Mily, hice una simulación en tu página: inmueble de " + fmtMoney.format(value) +
      ", financiando el " + pct + "% (" + fmtMoney.format(loan) + ") a " + years + " años (" + years * 12 +
      " meses), tasa de referencia " + rate + "% E.A. Cuota estimada: " + fmtMoney.format(pay) +
      ". Quiero asesoría."
    ));
  }

  elValue.value = fmtNumber.format(SIM.value);
  elPct.value = SIM.pct;
  elTerm.value = SIM.years;
  elRate.value = SIM.rate;

  elValue.addEventListener("input", function () {
    var digits = elValue.value.replace(/\D/g, "").slice(0, 12);
    elValue.value = digits ? fmtNumber.format(Number(digits)) : "";
    updateSim();
  });
  [elPct, elTerm, elRate].forEach(function (input) {
    input.addEventListener("input", updateSim);
  });
  updateSim();

  /* ---------- Animaciones de entrada ---------- */
  function setupReveal() {
    var reveals = $$(".reveal:not(.is-visible)");
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if ("IntersectionObserver" in window && !reduce) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
      reveals.forEach(function (el, i) {
        el.style.transitionDelay = (i % 4) * 70 + "ms";
        io.observe(el);
      });
    } else {
      reveals.forEach(function (el) { el.classList.add("is-visible"); });
    }
  }

  /* ---------- Formulario → WhatsApp ---------- */
  var form = $("#contact-form");
  var nameInput = $("#f-name");
  var nameError = $("#f-name-error");
  var phoneInput = $("#f-phone");
  var cityInput = $("#f-city");
  var interest = $("#f-interest");
  var message = $("#f-message");

  // Los botones "Consultar…" preseleccionan el interés del formulario.
  $$("[data-interest]").forEach(function (el) {
    el.addEventListener("click", function () {
      var value = el.getAttribute("data-interest");
      $$("option", interest).forEach(function (opt) {
        if (opt.textContent === value) interest.value = opt.value;
      });
    });
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var name = nameInput.value.trim();
    if (!name) {
      nameInput.setAttribute("aria-invalid", "true");
      nameInput.setAttribute("aria-describedby", "f-name-error");
      nameError.textContent = "Por favor escribe tu nombre.";
      nameInput.focus();
      return;
    }
    nameInput.removeAttribute("aria-invalid");
    nameError.textContent = "";

    var city = cityInput.value.trim();
    var phone = phoneInput.value.trim();
    var text = "Hola Mily, soy " + name + (city ? " de " + city : "") + ". Me interesa: " + interest.value + ".";
    var extra = message.value.trim();
    if (extra) text += "\n\n" + extra;
    if (phone) text += "\n\nMi teléfono: " + phone;

    var url = waUrl(text);
    var win = window.open(url, "_blank", "noopener");
    if (!win) window.location.href = url;
  });
  nameInput.addEventListener("input", function () {
    if (nameInput.value.trim()) {
      nameInput.removeAttribute("aria-invalid");
      nameError.textContent = "";
    }
  });

  /* ---------- Helpers de DOM ---------- */
  function svgIcon(id) {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "icon");
    svg.setAttribute("aria-hidden", "true");
    var use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#" + id);
    svg.appendChild(use);
    return svg;
  }
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  /* ---------- Propiedades ---------- */
  var list = $("#prop-list");
  var filtersBox = $("#prop-filters");
  var emptyBox = $("#prop-empty");
  var items = Array.isArray(window.PROPIEDADES) ? window.PROPIEDADES.filter(function (p) { return p && p.titulo; }) : [];

  function feat(icon, label) {
    var li = el("li");
    li.appendChild(svgIcon(icon));
    li.appendChild(document.createTextNode(label));
    return li;
  }

  function card(p) {
    var art = el("article", "prop");

    var media = el("div", "prop-media");
    var fallback = el("div", "prop-fallback");
    fallback.appendChild(svgIcon("i-key"));
    media.appendChild(fallback);
    if (p.imagen) {
      var img = document.createElement("img");
      img.src = p.imagen;
      img.alt = p.titulo;
      img.loading = "lazy";
      img.onerror = function () { img.remove(); };
      media.appendChild(img);
    }
    var badges = el("div", "prop-badges");
    if (p.operacion) badges.appendChild(el("span", "badge", p.operacion));
    if (p.internacional) badges.appendChild(el("span", "badge badge-dark", "Internacional"));
    media.appendChild(badges);
    art.appendChild(media);

    var body = el("div", "prop-body");
    if (p.precio) body.appendChild(el("p", "prop-price", p.precio));
    body.appendChild(el("h3", null, p.titulo));
    if (p.ubicacion) {
      var loc = el("p", "prop-loc");
      loc.appendChild(svgIcon("i-pin"));
      loc.appendChild(document.createTextNode(p.ubicacion));
      body.appendChild(loc);
    }

    var feats = el("ul", "prop-feats");
    if (p.tipo) feats.appendChild(feat("i-key", p.tipo));
    if (p.habitaciones != null) feats.appendChild(feat("i-bed", p.habitaciones + " hab."));
    if (p.banos != null) feats.appendChild(feat("i-bath", p.banos + (Number(p.banos) === 1 ? " baño" : " baños")));
    if (p.area) feats.appendChild(feat("i-area", p.area));
    if (feats.children.length) body.appendChild(feats);

    var cta = el("a", "btn btn-navy prop-cta");
    cta.href = waUrl("Hola Mily, me interesa esta propiedad: " + p.titulo + (p.ubicacion ? " (" + p.ubicacion + ")" : "") + ". ¿Me das más información?");
    cta.target = "_blank";
    cta.rel = "noopener";
    cta.appendChild(svgIcon("i-whatsapp"));
    cta.appendChild(document.createTextNode(" Consultar"));
    body.appendChild(cta);

    art.appendChild(body);
    return art;
  }

  function render(filter) {
    list.textContent = "";
    items
      .filter(function (p) {
        if (filter === "Todas") return true;
        if (filter === "Internacional") return !!p.internacional;
        return p.operacion === filter;
      })
      .forEach(function (p) { list.appendChild(card(p)); });
  }

  if (items.length) {
    emptyBox.hidden = true;

    var filters = ["Todas"];
    ["Venta", "Alquiler"].forEach(function (op) {
      if (items.some(function (p) { return p.operacion === op; })) filters.push(op);
    });
    if (items.some(function (p) { return p.internacional; })) filters.push("Internacional");

    if (filters.length > 2) {
      filtersBox.hidden = false;
      filters.forEach(function (name, i) {
        var chip = el("button", "chip", name);
        chip.type = "button";
        chip.setAttribute("aria-pressed", String(i === 0));
        chip.addEventListener("click", function () {
          $$(".chip", filtersBox).forEach(function (c) { c.setAttribute("aria-pressed", String(c === chip)); });
          render(name);
        });
        filtersBox.appendChild(chip);
      });
    }
    render("Todas");
  }

  /* ---------- Testimonios (solo se muestran si hay datos reales) ---------- */
  var testis = Array.isArray(window.TESTIMONIOS) ? window.TESTIMONIOS.filter(function (t) { return t && t.texto && t.nombre; }) : [];
  if (testis.length) {
    var testiSection = $("#testimonios");
    var testiList = $("#testi-list");
    testiSection.hidden = false;
    testis.forEach(function (t) {
      var box = el("article", "testi reveal");
      box.appendChild(el("blockquote", null, "“" + t.texto + "”"));
      var who = el("div", "testi-who");
      var initials = t.nombre.split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join("");
      who.appendChild(el("span", "avatar", initials));
      var info = el("div");
      info.appendChild(el("strong", null, t.nombre));
      if (t.detalle) info.appendChild(el("small", null, t.detalle));
      who.appendChild(info);
      box.appendChild(who);
      testiList.appendChild(box);
    });
  }

  setupReveal();
})();
