/* 题目编辑器：题目块全部由前端渲染，服务端只提供初始 JSON。
   刻意不用 innerHTML 拼接（用户输入可能含 <>），所有文本走 textContent。 */
(function () {
  "use strict";

  var host = document.getElementById("questions");
  if (!host) return;

  var readonly = host.dataset.readonly === "1";
  var initial = [];
  try {
    initial = JSON.parse(host.dataset.qjson || "[]");
  } catch (e) {
    initial = [];
  }
  var nextIndex = initial.length;

  var TYPES = [
    ["single", "单选"],
    ["multiple", "多选"],
    ["text", "简答"],
    ["rank", "排序"]
  ];

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function labeled(text, control) {
    var wrap = el("label");
    wrap.appendChild(document.createTextNode(text));
    wrap.appendChild(control);
    return wrap;
  }

  // 只读态必须用 readOnly 而不是 disabled：disabled 的控件不会随表单提交，
  // 服务端会解析出 0 道题，于是"已有票的投票"连标题都保存不了。
  // select / checkbox 不支持 readOnly，只能禁用 + 用一个同名 hidden 顶替。
  function input(name, type, value) {
    var i = document.createElement("input");
    i.type = type;
    i.name = name;
    if (value !== undefined && value !== null) i.value = value;
    if (!readonly) return i;
    if (type === "checkbox") {
      i.disabled = true;
      i.checked = false; // 由调用方决定，见 mirrorCheckbox
      return i;
    }
    i.readOnly = true;
    return i;
  }

  function mirror(name, value) {
    var h = document.createElement("input");
    h.type = "hidden";
    h.name = name;
    h.value = value;
    return h;
  }

  function renumber() {
    var sets = host.querySelectorAll("fieldset.q");
    for (var i = 0; i < sets.length; i++) {
      var legend = sets[i].querySelector("legend .q-no");
      if (legend) legend.textContent = "第 " + (i + 1) + " 题";
    }
  }

  // stateOf 把服务端给的题目 JSON（或空）归一化成编辑器内部状态。
  // 编辑器里所有可编辑字段都放在这个对象上，切题型时先读回 DOM 再重建，
  // 选项文字才不会跟着"多选 → 单选"一起消失（issue #41 第 3 条）。
  function stateOf(q) {
    return {
      type: q && q.type ? q.type : "single",
      title: q && q.title ? q.title : "",
      hint: q && q.hint ? q.hint : "",
      required: q ? !!q.required : true,
      min_choices: q && q.min_choices != null ? q.min_choices : 1,
      max_choices: q && q.max_choices != null ? q.max_choices : 0,
      max_length: q && q.max_length != null ? q.max_length : 300,
      options: q && q.options ? q.options.slice() : ["", ""]
    };
  }

  function byName(fieldset, name) {
    return fieldset.querySelector('[name="' + name + '"]');
  }

  // num 读数字输入框；空串/非法值退回旧值，避免"清空一下再切题型"把设置弄成 0。
  function num(value, prev) {
    var s = String(value == null ? "" : value).trim();
    if (s === "" || isNaN(Number(s))) return prev;
    return Number(s);
  }

  // readState 把当前 DOM 里正在编辑的内容读回状态对象。
  function readState(fieldset, idx) {
    var st = fieldset._qstate || stateOf(null);
    var p = "q" + idx + "_";

    var title = byName(fieldset, p + "title");
    var hint = byName(fieldset, p + "hint");
    var required = byName(fieldset, p + "required");
    var min = byName(fieldset, p + "min");
    var max = byName(fieldset, p + "max");
    var maxLen = byName(fieldset, p + "max_length");

    if (title) st.title = title.value;
    if (hint) st.hint = hint.value;
    if (required && required.type === "checkbox") st.required = required.checked;
    if (min) st.min_choices = num(min.value, st.min_choices);
    if (max) st.max_choices = num(max.value, st.max_choices);
    if (maxLen) st.max_length = num(maxLen.value, st.max_length);

    // 简答题没有选项区；此时保留上一次的选项，切回选择题还能找回。
    var optsBox = fieldset.querySelector(".opts");
    if (optsBox) {
      var values = [];
      var rows = optsBox.querySelectorAll(".opt-row input");
      for (var i = 0; i < rows.length; i++) values.push(rows[i].value);
      st.options = values;
    }
    return st;
  }

  function buildLimits(fieldset, idx, q) {
    var old = fieldset.querySelector(".q-limits");
    if (old) old.remove();
    var box = el("div", "q-limits grid-3");
    var required = document.createElement("input");
    required.type = "checkbox";
    required.name = "q" + idx + "_required";
    required.checked = q ? !!q.required : true;
    if (readonly) {
      required.disabled = true;
      if (required.checked) box.appendChild(mirror("q" + idx + "_required", "on"));
    }
    var requiredLabel = el("label", "check");
    requiredLabel.appendChild(required);
    requiredLabel.appendChild(document.createTextNode(" 必答"));

    box.appendChild(requiredLabel);
    if (q && (q.type === "multiple")) {
      // 0 是合法值（可以一项都不选），所以不能用 `|| 1` 兜底。
      var minInput = input("q" + idx + "_min", "number", q.min_choices != null ? q.min_choices : 1);
      minInput.min = "0";
      minInput.step = "1";
      var maxInput = input("q" + idx + "_max", "number", q.max_choices != null ? q.max_choices : 0);
      maxInput.min = "0";
      maxInput.step = "1";
      box.appendChild(labeled("最少选择（0 表示可不选）", minInput));
      box.appendChild(labeled("最多选择（0 表示不限）", maxInput));
    } else if (q && q.type === "text") {
      box.appendChild(labeled("字数上限", input("q" + idx + "_max_length", "number", q.max_length || 300)));
    } else {
      box.appendChild(el("span"));
      box.appendChild(el("span"));
    }
    fieldset.appendChild(box);
  }

  function buildOptions(fieldset, idx, q) {
    var old = fieldset.querySelector(".opts");
    if (old) old.remove();
    var addBtn = fieldset.querySelector(".q-addopt");
    if (addBtn) addBtn.remove();

    if (q && q.type === "text") return;

    var box = el("div", "opts");
    box.dataset.optHost = "1";
    fieldset.appendChild(box);

    var labels = (q && q.options && q.options.length) ? q.options : ["", ""];
    for (var i = 0; i < labels.length; i++) addOptionRow(box, idx, labels[i]);

    if (!readonly) {
      var btn = el("button", "btn-quiet q-addopt", "＋ 选项");
      btn.type = "button";
      btn.addEventListener("click", function () {
        addOptionRow(box, idx, "");
        syncOptionIndexes(box);
      });
      fieldset.appendChild(btn);
    }
    syncOptionIndexes(box);
  }

  function addOptionRow(box, idx, value) {
    var row = el("div", "opt-row");
    var field = input("q" + idx + "_opt0", "text", value);
    field.placeholder = "选项文字";
    row.appendChild(field);
    if (!readonly) {
      var del = el("button", "btn-quiet", "删除");
      del.type = "button";
      del.addEventListener("click", function () {
        row.remove();
        syncOptionIndexes(box);
      });
      row.appendChild(del);
    }
    box.appendChild(row);
  }

  function syncOptionIndexes(box) {
    var rows = box.querySelectorAll(".opt-row input");
    for (var i = 0; i < rows.length; i++) {
      rows[i].name = rows[i].name.replace(/_opt\d+$/, "_opt" + i);
    }
  }

  function buildQuestion(q) {
    var idx = nextIndex++;
    var state = stateOf(q);
    var fieldset = el("fieldset", "q");
    fieldset.dataset.q = String(idx);
    fieldset._qstate = state;

    var legend = el("legend");
    legend.appendChild(el("span", "q-no", "第 " + (host.querySelectorAll("fieldset.q").length + 1) + " 题"));
    if (!readonly) {
      var del = el("button", "btn-quiet q-del", "删除");
      del.type = "button";
      del.addEventListener("click", function () {
        fieldset.remove();
        renumber();
      });
      legend.appendChild(del);
    }
    fieldset.appendChild(legend);

    var top = el("div", "grid-2");
    var select = document.createElement("select");
    select.name = "q" + idx + "_type";
    if (readonly) select.disabled = true;
    for (var t = 0; t < TYPES.length; t++) {
      var opt = document.createElement("option");
      opt.value = TYPES[t][0];
      opt.textContent = TYPES[t][1];
      if (state.type === TYPES[t][0]) opt.selected = true;
      select.appendChild(opt);
    }
    top.appendChild(labeled("题型", select));
    var title = input("q" + idx + "_title", "text", state.title);
    title.placeholder = "题干";
    top.appendChild(labeled("题干", title));
    if (readonly) {
      top.appendChild(mirror("q" + idx + "_type", state.type));
    }
    fieldset.appendChild(top);

    fieldset.appendChild(labeled("提示（可选）", input("q" + idx + "_hint", "text", state.hint)));

    buildLimits(fieldset, idx, state);
    buildOptions(fieldset, idx, state);

    select.addEventListener("change", function () {
      // 先保存当前编辑内容（含选项文字），再按新题型重建控件；
      // 以前这里传的是一个全新的默认对象，已填的选项会被整块丢掉。
      var next = readState(fieldset, idx);
      next.type = select.value;
      fieldset._qstate = next;
      buildLimits(fieldset, idx, next);
      buildOptions(fieldset, idx, next);
    });

    host.appendChild(fieldset);
    return fieldset;
  }

  // CSP 里没有 unsafe-inline，模板上的 onsubmit="confirm(...)" 会被浏览器拦掉，
  // 结果是"删除管理员/删除投票"点下去直接提交。统一改成 data-confirm + 委托。
  document.addEventListener("submit", function (event) {
    var form = event.target;
    if (!form || !form.getAttribute) return;
    var msg = form.getAttribute("data-confirm");
    if (!msg) return;
    if (!window.confirm(msg)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  var addBtn = document.querySelector("[data-add-question]");
  if (addBtn) {
    addBtn.addEventListener("click", function () {
      buildQuestion(null);
      renumber();
    });
  }

  if (initial.length === 0) {
    buildQuestion(null);
  } else {
    for (var i = 0; i < initial.length; i++) buildQuestion(initial[i]);
  }
  renumber();
})();
