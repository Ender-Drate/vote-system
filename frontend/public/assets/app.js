/* 前台交互：排序调整、字数统计、防重复提交、错误聚焦。
   不依赖任何框架；CSP 只允许同源脚本。 */
(function () {
  "use strict";

  /* ---- 排序题 ---- */
  document.querySelectorAll("[data-rank]").forEach(function (list) {
    var items = function () { return Array.prototype.slice.call(list.querySelectorAll(".rank-item")); };

    function refresh() {
      items().forEach(function (item, index) {
        var pos = item.querySelector(".rank-pos");
        if (pos) pos.textContent = String(index + 1);
        var up = item.querySelector('[data-move="-1"]');
        var down = item.querySelector('[data-move="1"]');
        if (up) up.disabled = index === 0;
        if (down) down.disabled = index === items().length - 1;
      });
    }

    list.addEventListener("click", function (event) {
      var btn = event.target.closest("[data-move]");
      if (!btn) return;
      var item = btn.closest(".rank-item");
      if (!item) return;
      var dir = Number(btn.getAttribute("data-move"));
      var all = items();
      var index = all.indexOf(item);
      var target = index + dir;
      if (target < 0 || target >= all.length) return;
      if (dir < 0) {
        list.insertBefore(item, all[target]);
      } else {
        list.insertBefore(all[target], item);
      }
      refresh();
      var live = list.parentElement.querySelector("[data-rank-live]");
      if (live) {
        var pos = item.querySelector(".rank-pos");
        live.textContent = (item.querySelector(".rank-label") || {}).textContent + " → 第 " + pos.textContent + " 位";
      }
      btn.focus();
    });

    refresh();
  });

  /* ---- 简答题字数 ---- */
  document.querySelectorAll("textarea[data-counter]").forEach(function (area) {
    var target = document.getElementById(area.getAttribute("data-counter"));
    if (!target) return;
    var template = target.textContent || "";
    var max = Number(area.getAttribute("maxlength")) || 0;
    function update() {
      var count = Array.from(area.value).length;
      target.textContent = template.replace(/^\d+/, String(count));
      if (max > 0 && count > max * 0.9) {
        target.style.color = "var(--stamp)";
      } else {
        target.style.removeProperty("color");
      }
    }
    area.addEventListener("input", update);
    update();
  });

  /* ---- 工作量证明 ---- */
  (function () {
    var box = document.querySelector("[data-pow]");
    if (!box) return;
    var status = box.querySelector("[data-pow-status]");
    var field = box.querySelector('input[name="pow_solution"]');
    var submit = document.querySelector('form.vote-form button[type="submit"]');
    var challenge;
    try { challenge = JSON.parse(box.getAttribute("data-pow") || "{}"); } catch (e) { challenge = null; }
    if (!challenge || !challenge.salt) return;

    function setStatus(text, isError) {
      if (!status) return;
      status.textContent = text;
      status.setAttribute("data-state", isError ? "error" : "ok");
    }

    function enableSubmit() {
      if (submit) submit.disabled = false;
    }

    if (!window.Worker) {
      setStatus("浏览器不支持人机校验，请换用较新的浏览器。", true);
      return;
    }

    var worker;
    try {
      var workerURL = box.getAttribute("data-pow-worker") || "/assets/pow-worker.js";
      worker = new Worker(workerURL);
    } catch (e) {
      setStatus("人机校验启动失败，请刷新页面重试。", true);
      return;
    }
    worker.onmessage = function (event) {
      var msg = event.data || {};
      if (msg.progress !== undefined) {
        var pct = Math.min(99, Math.floor((msg.progress / Math.pow(2, challenge.bits)) * 100));
        if (status) status.setAttribute("data-state", "run");
        setStatus("正在校验浏览器… " + pct + "%", false);
        if (status) status.setAttribute("data-state", "run");
        return;
      }
      if (msg.ok) {
        field.value = JSON.stringify({
          nonce: challenge.nonce, salt: challenge.salt, bits: challenge.bits,
          expires: challenge.expires, signature: challenge.signature, counter: msg.counter
        });
        setStatus("校验通过，可以提交了。", false);
        enableSubmit();
        worker.terminate();
      } else {
        setStatus("人机校验失败，请刷新页面重试。", true);
      }
    };
    worker.onerror = function () {
      setStatus("人机校验失败，请刷新页面重试。", true);
    };
    setStatus("正在校验浏览器… 0%", false);
    worker.postMessage({ salt: challenge.salt, bits: challenge.bits });
  })();

  /* ---- 整份投票的选项总数上限 ---- */
  (function () {
    var form = document.querySelector("form.vote-form[data-max-total]");
    if (!form) return;
    var max = Number(form.getAttribute("data-max-total")) || 0;
    var note = form.querySelector("[data-total-note]");
    var count = form.querySelector("[data-total-count]");
    if (max <= 0) return;

    function chosen() {
      var n = 0;
      form.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach(function (el) {
        if (el.checked && /^q\d+/.test(el.name || "")) n++;
      });
      return n;
    }

    function refresh() {
      var n = chosen();
      var over = n > max;
      if (count) count.textContent = String(n);
      if (note) note.setAttribute("data-over", over ? "1" : "0");
      form.setAttribute("data-over-limit", over ? "1" : "0");
    }

    form.addEventListener("change", function (event) {
      var name = (event.target && event.target.name) || "";
      if (/^q\d+/.test(name)) refresh();
    });
    refresh();
  })();

  /* ---- 防重复提交 ---- */
  document.querySelectorAll("form.vote-form").forEach(function (form) {
    form.addEventListener("submit", function (event) {
      // 超出"整份投票最多票数"时直接拦住：后台也会拒绝，这里只是省一次往返。
      if (form.getAttribute("data-over-limit") === "1") {
        event.preventDefault();
        var note = form.querySelector("[data-total-note]");
        if (note) {
          note.setAttribute("data-over", "1");
          note.setAttribute("tabindex", "-1");
          note.focus();
        }
        return;
      }
      var btn = form.querySelector('button[type="submit"]');
      if (!btn) return;
      if (btn.dataset.busy === "1") return;
      btn.dataset.busy = "1";
      btn.disabled = true;
      window.setTimeout(function () {
        /* 服务端返回错误时页面会重载，这里只是兜底恢复 */
        if (btn.dataset.busy === "1") {
          btn.disabled = false;
          btn.dataset.busy = "0";
        }
      }, 8000);
    });
  });

  /* ---- 提交失败时聚焦错误区 ---- */
  var errorBox = document.getElementById("form-error");
  if (errorBox) {
    errorBox.focus();
  }
})();
