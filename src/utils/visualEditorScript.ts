export function buildVisualEditorInjection(
  instanceId: string,
  isFullDocument: boolean
): string {
  const safeId = JSON.stringify(instanceId);
  const fullDocFlag = isFullDocument ? 'true' : 'false';

  return `<style data-slideino-editor="true">
html.__sl_edit_mode__,
html.__sl_edit_mode__ * {
  cursor: default !important;
  user-select: none !important;
  -webkit-user-select: none !important;
}
html.__sl_edit_mode__ [data-sl-hover="true"],
html.__sl_edit_mode__ [data-sl-hover="true"] * {
  cursor: pointer !important;
}
html.__sl_edit_mode__ [data-sl-selected="true"],
html.__sl_edit_mode__ [data-sl-selected="true"] * {
  cursor: move !important;
}
html.__sl_edit_mode__ [data-sl-editing="true"],
html.__sl_edit_mode__ [data-sl-editing="true"] * {
  outline: none !important;
  cursor: text !important;
  user-select: text !important;
  -webkit-user-select: text !important;
}
html.__sl_dragging__,
html.__sl_dragging__ * {
  cursor: grabbing !important;
}
html[data-sl-resize-cursor="nwse-resize"],
html[data-sl-resize-cursor="nwse-resize"] * {
  cursor: nwse-resize !important;
}
html[data-sl-resize-cursor="nesw-resize"],
html[data-sl-resize-cursor="nesw-resize"] * {
  cursor: nesw-resize !important;
}
html[data-sl-resize-cursor="ns-resize"],
html[data-sl-resize-cursor="ns-resize"] * {
  cursor: ns-resize !important;
}
html[data-sl-resize-cursor="ew-resize"],
html[data-sl-resize-cursor="ew-resize"] * {
  cursor: ew-resize !important;
}
#__slideino_editor_overlay__ {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 2147483640;
  font-family: system-ui, -apple-system, sans-serif;
  direction: ltr;
}
.__sl_hover_box__ {
  position: fixed;
  pointer-events: none;
  border: 1.5px dashed rgba(37, 99, 235, 0.8);
  background: rgba(37, 99, 235, 0.04);
  box-sizing: border-box;
  display: none;
}
.__sl_hover_badge__ {
  position: absolute;
  top: -20px;
  left: -1px;
  background: rgba(15, 23, 42, 0.86);
  color: #f8fafc;
  font-size: 10px;
  font-weight: 500;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 3px;
  white-space: nowrap;
}
.__sl_sel_box__ {
  position: fixed;
  pointer-events: none;
  border: 2px solid #2563eb;
  box-sizing: border-box;
  display: none;
}
.__sl_sel_box__.is-editing {
  border-color: #10b981;
  border-style: solid;
}
.__sl_badge__ {
  position: absolute;
  top: -24px;
  left: -2px;
  background: #2563eb;
  color: #ffffff;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  padding: 4px 7px;
  border-radius: 4px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.25);
}
.__sl_sel_box__.is-editing .__sl_badge__ {
  background: #059669;
}
.__sl_handle__ {
  position: absolute;
  width: 10px;
  height: 10px;
  background: #ffffff;
  border: 2px solid #2563eb;
  border-radius: 2px;
  box-sizing: border-box;
  pointer-events: auto;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.25);
}
.__sl_sel_box__.is-editing .__sl_handle__ {
  display: none;
}
html.__sl_edit_mode__ .__sl_handle__[data-h="nw"] { top: -5px; left: -5px; cursor: nwse-resize !important; }
html.__sl_edit_mode__ .__sl_handle__[data-h="n"]  { top: -5px; left: calc(50% - 5px); cursor: ns-resize !important; }
html.__sl_edit_mode__ .__sl_handle__[data-h="ne"] { top: -5px; right: -5px; cursor: nesw-resize !important; }
html.__sl_edit_mode__ .__sl_handle__[data-h="e"]  { top: calc(50% - 5px); right: -5px; cursor: ew-resize !important; }
html.__sl_edit_mode__ .__sl_handle__[data-h="se"] { bottom: -5px; right: -5px; cursor: nwse-resize !important; }
html.__sl_edit_mode__ .__sl_handle__[data-h="s"]  { bottom: -5px; left: calc(50% - 5px); cursor: ns-resize !important; }
html.__sl_edit_mode__ .__sl_handle__[data-h="sw"] { bottom: -5px; left: -5px; cursor: nesw-resize !important; }
html.__sl_edit_mode__ .__sl_handle__[data-h="w"]  { top: calc(50% - 5px); left: -5px; cursor: ew-resize !important; }
.__sl_guide_v__ {
  position: fixed;
  top: 0;
  bottom: 0;
  width: 1px;
  background: #3b82f6;
  pointer-events: none;
  display: none;
}
.__sl_guide_h__ {
  position: fixed;
  left: 0;
  right: 0;
  height: 1px;
  background: #3b82f6;
  pointer-events: none;
  display: none;
}
</style>
<script data-slideino-editor="true">
(function() {
  var INSTANCE_ID = ${safeId};
  var IS_FULL_DOC = ${fullDocFlag};
  var snapEnabled = true;
  var uidCounter = 1;
  var selectedEl = null;
  var hoveredEl = null;
  var editingEl = null;
  var dragState = null;
  var resizeState = null;
  var overlayRoot = null;
  var hoverBox = null;
  var hoverBadge = null;
  var selBox = null;
  var selBadge = null;
  var guideV = null;
  var guideH = null;

  function postHost(type, payload) {
    try {
      window.parent.postMessage({
        source: 'slideino-frame',
        instanceId: INSTANCE_ID,
        type: type,
        payload: payload
      }, '*');
    } catch (_) {}
  }

  function rgbToHex(rgbStr) {
    if (!rgbStr) return '';
    var m = rgbStr.match(/rgba?\\((\\d+)[,\\s]+(\\d+)[,\\s]+(\\d+)(?:[,\\s/]+([\\d.]+))?\\)/i);
    if (!m) return rgbStr;
    var a = m[4] !== undefined ? parseFloat(m[4]) : 1;
    if (a === 0) return 'transparent';
    var toHex = function(n) {
      var h = Math.max(0, Math.min(255, parseInt(n, 10))).toString(16);
      return h.length === 1 ? '0' + h : h;
    };
    return '#' + toHex(m[1]) + toHex(m[2]) + toHex(m[3]);
  }

  function getCanvasRoot() {
    var sc = document.body ? document.body.querySelector(':scope > .slide-container') : null;
    return sc || document.body;
  }

  function isEditorNode(el) {
    if (!el || el.nodeType !== 1) return true;
    return Boolean(el.closest && el.closest('[data-slideino-editor="true"]'));
  }

  function isCanvasShell(el) {
    if (!el || el === document.documentElement || el === document.body) return true;
    var root = getCanvasRoot();
    if (el === root) return true;
    if (el.classList && el.classList.contains('slide-container')) return true;
    return false;
  }

  function ensureUid(el) {
    var id = el.getAttribute('data-sl-id');
    if (!id) {
      id = 'sl-' + (uidCounter++);
      el.setAttribute('data-sl-id', id);
    }
    return id;
  }

  function classifyElement(el) {
    var tag = el.tagName.toLowerCase();
    var objType = (el.getAttribute('data-object-type') || '').toLowerCase();
    if (tag === 'img' || tag === 'picture' || tag === 'video') return 'image';
    if (objType === 'shape' || tag === 'hr' || tag === 'svg' || tag === 'canvas') return 'shape';
    if (objType === 'textbox' || /^h[1-6]$/.test(tag) || tag === 'p' || tag === 'span' || tag === 'a' || tag === 'li' || tag === 'blockquote' || tag === 'figcaption' || tag === 'button') {
      return 'text';
    }
    var txt = (el.textContent || '').trim();
    if (txt.length > 0 && el.children.length <= 4) return 'text';
    if (txt.length === 0) return 'shape';
    return 'container';
  }

  function getElementLabel(el) {
    var tag = el.tagName.toLowerCase();
    var objType = (el.getAttribute('data-object-type') || '').toLowerCase();
    var txt = (el.textContent || '').replace(/\\s+/g, ' ').trim();
    if (tag === 'img') {
      var alt = (el.getAttribute('alt') || '').trim();
      return alt ? 'Image: ' + alt.slice(0, 26) : 'Image';
    }
    if (txt.length > 0) {
      return txt.slice(0, 32);
    }
    if (objType === 'shape') return 'Shape';
    if (tag === 'svg') return 'SVG Graphic';
    if (tag === 'canvas') return 'Chart / Canvas';
    return tag.toUpperCase();
  }

  function canEditTextDirectly(el) {
    if (!el || el.nodeType !== 1) return false;
    var tag = el.tagName.toLowerCase();
    if (tag === 'img' || tag === 'svg' || tag === 'canvas' || tag === 'hr' || tag === 'video' || tag === 'iframe') {
      return false;
    }
    var objType = (el.getAttribute('data-object-type') || '').toLowerCase();
    if (objType === 'shape' && !(el.textContent || '').trim()) return false;
    return true;
  }

  function hasSimpleDirectText(el) {
    if (!el) return false;
    if (el.children.length === 0) return true;
    // Allow editing textContent via inspector when children are simple inline tags or line breaks
    for (var i = 0; i < el.children.length; i++) {
      var t = el.children[i].tagName.toLowerCase();
      if (['br', 'b', 'strong', 'i', 'em', 'u', 'span', 'small', 'mark', 'code'].indexOf(t) === -1) {
        return false;
      }
    }
    return el.children.length <= 2;
  }

  function resolveClickableTarget(rawTarget, allowDrill) {
    if (!rawTarget || rawTarget.nodeType !== 1) return null;
    if (isEditorNode(rawTarget)) return null;
    var el = rawTarget;

    // Walk up from SVG inner paths/shapes to the <svg> root
    if (el.closest && el.closest('svg')) {
      el = el.closest('svg');
    }

    if (isCanvasShell(el)) return null;

    // If inside a [data-object="true"] block (GenSpark/slide objects), prefer the object container first
    var dataObj = el.closest ? el.closest('[data-object="true"]') : null;
    if (dataObj && !isCanvasShell(dataObj)) {
      if (allowDrill && selectedEl === dataObj && el !== dataObj) {
        return el;
      }
      return dataObj;
    }

    // For general HTML slides, avoid selecting tiny inline formatting tags unless parent is already selected
    var inlineTags = ['strong', 'em', 'b', 'i', 'u', 'mark', 'sub', 'sup'];
    while (el && el.parentElement && inlineTags.indexOf(el.tagName.toLowerCase()) !== -1) {
      if (allowDrill && selectedEl === el.parentElement) break;
      el = el.parentElement;
    }

    if (isCanvasShell(el)) return null;
    return el;
  }

  function getOverlayPositionMode(el) {
    var cs = window.getComputedStyle(el);
    return cs.position || 'static';
  }

  function getHorizontalAnchor(el) {
    if (el.style.right && !el.style.left) return 'right';
    return 'left';
  }

  function buildElementInfo(el) {
    var id = ensureUid(el);
    var cs = window.getComputedStyle(el);
    var rect = el.getBoundingClientRect();
    var rootRect = getCanvasRoot().getBoundingClientRect();
    var posMode = getOverlayPositionMode(el);
    var anchor = getHorizontalAnchor(el);
    var kind = classifyElement(el);

    var xVal;
    if (posMode === 'absolute' || posMode === 'fixed') {
      if (anchor === 'right') {
        var parsedRight = parseFloat(el.style.right);
        xVal = Number.isFinite(parsedRight) ? Math.round(parsedRight) : Math.round(rootRect.right - rect.right);
      } else {
        var parsedLeft = parseFloat(el.style.left);
        xVal = Number.isFinite(parsedLeft) ? Math.round(parsedLeft) : Math.round(rect.left - rootRect.left);
      }
    } else {
      xVal = Math.round(parseFloat(el.style.left) || 0);
    }

    var yVal;
    if (posMode === 'absolute' || posMode === 'fixed') {
      var parsedTop = parseFloat(el.style.top);
      yVal = Number.isFinite(parsedTop) ? Math.round(parsedTop) : Math.round(rect.top - rootRect.top);
    } else {
      yVal = Math.round(parseFloat(el.style.top) || 0);
    }

    var zVal = parseInt(cs.zIndex, 10);
    if (!Number.isFinite(zVal)) zVal = 0;

    var align = cs.textAlign || 'left';
    if (align === 'start') align = cs.direction === 'rtl' ? 'right' : 'left';
    if (align === 'end') align = cs.direction === 'rtl' ? 'left' : 'right';
    if (['left', 'center', 'right', 'justify'].indexOf(align) === -1) align = 'left';

    var parentCandidate = el.parentElement;
    var hasParent = Boolean(parentCandidate && !isCanvasShell(parentCandidate) && !isEditorNode(parentCandidate));
    var hasText = (el.textContent || '').trim().length > 0;
    var rawDeco = (cs.textDecorationLine || cs.textDecoration || 'none').toLowerCase();
    var textDeco = rawDeco.indexOf('underline') !== -1
      ? 'underline'
      : rawDeco.indexOf('line-through') !== -1
      ? 'line-through'
      : 'none';

    var info = {
      id: id,
      tag: el.tagName.toLowerCase(),
      label: getElementLabel(el),
      kind: kind,
      hasParent: hasParent,
      hasText: hasText,
      isTextEditable: canEditTextDirectly(el) && hasSimpleDirectText(el),
      textContent: hasSimpleDirectText(el) ? (el.innerText || el.textContent || '').trim() : '',
      dir: el.getAttribute('dir') || '',
      positionMode: posMode,
      horizontalAnchor: anchor,
      x: xVal,
      y: yVal,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      zIndex: zVal,
      fontFamily: cs.fontFamily || 'sans-serif',
      fontSize: Math.round(parseFloat(cs.fontSize) || 16),
      fontWeight: String(cs.fontWeight || '400'),
      fontStyle: cs.fontStyle === 'italic' || cs.fontStyle === 'oblique' ? 'italic' : 'normal',
      textDecoration: textDeco,
      textAlign: align,
      color: rgbToHex(cs.color),
      lineHeight: cs.lineHeight === 'normal' ? '1.4' : (Math.round((parseFloat(cs.lineHeight) / Math.max(1, parseFloat(cs.fontSize) || 16)) * 100) / 100).toString(),
      letterSpacing: cs.letterSpacing === 'normal' ? '0' : String(Math.round((parseFloat(cs.letterSpacing) || 0) * 10) / 10),
      backgroundColor: rgbToHex(cs.backgroundColor),
      borderRadius: Math.round(parseFloat(cs.borderRadius) || 0),
      opacity: Math.round((parseFloat(cs.opacity) || 1) * 100),
      padding: Math.round(parseFloat(cs.paddingTop) || 0)
    };

    if (el.tagName.toLowerCase() === 'img') {
      info.imgSrc = el.getAttribute('src') || '';
      info.imgAlt = el.getAttribute('alt') || '';
      info.objectFit = cs.objectFit || 'cover';
    }

    return info;
  }

  function collectAvailableFonts() {
    var fontSet = new Set();
    try {
      if (document.fonts && typeof document.fonts.forEach === 'function') {
        document.fonts.forEach(function(face) {
          if (face && face.family) {
            var clean = face.family.replace(/^['"]+|['"]+$/g, '').trim();
            if (clean && clean.indexOf('Font Awesome') === -1 && clean.indexOf('KaTeX') === -1) {
              fontSet.add(clean);
            }
          }
        });
      }
    } catch (_) {}

    try {
      var styles = document.querySelectorAll('style');
      for (var i = 0; i < styles.length; i++) {
        if (styles[i].getAttribute('data-slideino-editor') === 'true') continue;
        var text = styles[i].textContent || '';
        var m;
        var re = /@font-face\\s*\\{[^}]*font-family\\s*:\\s*['"]?([^'";}]+)['"]?/gi;
        while ((m = re.exec(text)) !== null) {
          var name = m[1].trim();
          if (name && name.indexOf('Font Awesome') === -1 && name.indexOf('KaTeX') === -1) {
            fontSet.add(name);
          }
        }
      }
    } catch (_) {}

    return Array.from(fontSet).slice(0, 24);
  }

  function collectLayers() {
    var root = getCanvasRoot();
    if (!root) return [];
    var candidates = [];

    // Prefer [data-object="true"] items if present (GenSpark / positioned slides)
    var dataObjects = root.querySelectorAll('[data-object="true"]');
    if (dataObjects.length > 0) {
      candidates = Array.from(dataObjects);
    } else {
      // Otherwise collect meaningful direct & content elements
      var all = Array.from(root.querySelectorAll('h1, h2, h3, h4, p, img, svg, canvas, blockquote, ul, ol, pre, table, button, a, section > div, main > div, article > div, [data-slide-block]'));
      var seen = new Set();
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        if (isEditorNode(el) || isCanvasShell(el)) continue;
        if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
        var r = el.getBoundingClientRect();
        if (r.width < 4 && r.height < 4) continue;
        if (!seen.has(el)) {
          seen.add(el);
          candidates.push(el);
        }
      }
      if (candidates.length === 0) {
        candidates = Array.from(root.children).filter(function(c) {
          return !isEditorNode(c) && !isCanvasShell(c) && c.tagName.toLowerCase() !== 'script' && c.tagName.toLowerCase() !== 'style';
        });
      }
    }

    return candidates.slice(0, 80).map(function(el) {
      var cs = window.getComputedStyle(el);
      var z = parseInt(cs.zIndex, 10);
      return {
        id: ensureUid(el),
        tag: el.tagName.toLowerCase(),
        label: getElementLabel(el),
        kind: classifyElement(el),
        zIndex: Number.isFinite(z) ? z : 0
      };
    });
  }

  function emitLayers() {
    postHost('layers-change', {
      layers: collectLayers(),
      slideDir: (document.documentElement.getAttribute('dir') || window.getComputedStyle(document.body).direction || 'ltr').toLowerCase(),
      availableFonts: collectAvailableFonts()
    });
  }

  function stripEditorAttrs(root) {
    if (root.classList) {
      root.classList.remove('__sl_edit_mode__', '__sl_dragging__');
      if (root.className === '') root.removeAttribute('class');
    }
    root.removeAttribute('data-sl-resize-cursor');
    root.querySelectorAll('[data-sl-id], [data-sl-editing], [data-sl-ce], [data-sl-selected], [data-sl-hover]').forEach(function(n) {
      n.removeAttribute('data-sl-id');
      n.removeAttribute('data-sl-editing');
      n.removeAttribute('data-sl-selected');
      n.removeAttribute('data-sl-hover');
      if (n.hasAttribute('data-sl-ce')) {
        n.removeAttribute('contenteditable');
        n.removeAttribute('spellcheck');
        n.removeAttribute('data-sl-ce');
      }
    });
  }

  function serializeCleanHtml() {
    if (IS_FULL_DOC) {
      var docClone = document.documentElement.cloneNode(true);
      docClone.querySelectorAll(
        '[data-slideino-editor="true"], [data-slideino-autofont="true"], [data-slideino-tokens="true"], [data-slideino-shared="true"], [data-slideino-overrides="true"], [data-slideino-theme="true"], [data-slideino-runtime="true"], #__slideino_editor_overlay__'
      ).forEach(function(n) { n.remove(); });
      stripEditorAttrs(docClone);
      return '<!doctype html>\\n' + docClone.outerHTML;
    }

    var bodyClone = document.body.cloneNode(true);
    bodyClone.querySelectorAll(
      '[data-slideino-editor="true"], [data-slideino-autofont="true"], [data-slideino-runtime="true"], #__slideino_editor_overlay__'
    ).forEach(function(n) { n.remove(); });
    stripEditorAttrs(bodyClone);
    return bodyClone.innerHTML.trim();
  }

  function syncToHost(commit) {
    var cleanHtml = serializeCleanHtml();
    postHost('dom-sync', {
      html: cleanHtml,
      commit: Boolean(commit)
    });
    if (selectedEl && document.contains(selectedEl)) {
      postHost('element-select', { element: buildElementInfo(selectedEl) });
    }
    if (commit) {
      emitLayers();
    }
  }

  function setHoveredElement(el) {
    if (hoveredEl === el) return;
    if (hoveredEl && document.contains(hoveredEl)) {
      hoveredEl.removeAttribute('data-sl-hover');
    }
    hoveredEl = el && el !== selectedEl && document.contains(el) ? el : null;
    if (hoveredEl) {
      hoveredEl.setAttribute('data-sl-hover', 'true');
    }
    updateOverlayBoxes();
  }

  function updateOverlayBoxes() {
    if (!selBox || !hoverBox) return;

    if (hoveredEl && hoveredEl !== selectedEl && !dragState && !resizeState && document.contains(hoveredEl)) {
      var hr = hoveredEl.getBoundingClientRect();
      hoverBox.style.display = 'block';
      hoverBox.style.left = hr.left + 'px';
      hoverBox.style.top = hr.top + 'px';
      hoverBox.style.width = Math.max(2, hr.width) + 'px';
      hoverBox.style.height = Math.max(2, hr.height) + 'px';
      if (hoverBadge) {
        hoverBadge.textContent = hoveredEl.tagName.toLowerCase() + ' · Click to select';
        hoverBadge.style.top = hr.top < 24 ? (Math.max(2, hr.height) + 4) + 'px' : '-20px';
      }
    } else {
      hoverBox.style.display = 'none';
    }

    if (selectedEl && document.contains(selectedEl)) {
      var sr = selectedEl.getBoundingClientRect();
      selBox.style.display = 'block';
      selBox.style.left = sr.left + 'px';
      selBox.style.top = sr.top + 'px';
      selBox.style.width = Math.max(4, sr.width) + 'px';
      selBox.style.height = Math.max(4, sr.height) + 'px';
      selBox.classList.toggle('is-editing', editingEl === selectedEl);

      var badgeText = selectedEl.tagName.toLowerCase() + ' · ' + Math.round(sr.width) + '×' + Math.round(sr.height);
      if (editingEl === selectedEl) {
        badgeText = 'Editing Text · Esc to finish';
      }
      selBadge.textContent = badgeText;
      selBadge.style.top = sr.top < 28 ? (Math.max(4, sr.height) + 4) + 'px' : '-24px';
    } else {
      selBox.style.display = 'none';
    }
  }

  function hideGuides() {
    if (guideV) guideV.style.display = 'none';
    if (guideH) guideH.style.display = 'none';
  }

  function showGuides(vx, hy) {
    if (guideV) {
      if (vx !== null) {
        guideV.style.left = Math.round(vx) + 'px';
        guideV.style.display = 'block';
      } else {
        guideV.style.display = 'none';
      }
    }
    if (guideH) {
      if (hy !== null) {
        guideH.style.top = Math.round(hy) + 'px';
        guideH.style.display = 'block';
      } else {
        guideH.style.display = 'none';
      }
    }
  }

  function stopInlineEditing(commitChanges) {
    if (!editingEl) return;
    var el = editingEl;
    editingEl = null;
    el.removeAttribute('data-sl-editing');
    if (el.hasAttribute('data-sl-ce')) {
      el.removeAttribute('contenteditable');
      el.removeAttribute('spellcheck');
      el.removeAttribute('data-sl-ce');
    }
    updateOverlayBoxes();
    if (commitChanges) {
      syncToHost(true);
    }
  }

  function selectElement(el) {
    if (editingEl && editingEl !== el) {
      stopInlineEditing(true);
    }
    if (selectedEl && document.contains(selectedEl)) {
      selectedEl.removeAttribute('data-sl-selected');
    }
    selectedEl = el && document.contains(el) ? el : null;
    if (selectedEl) {
      selectedEl.setAttribute('data-sl-selected', 'true');
      if (hoveredEl === selectedEl) {
        hoveredEl.removeAttribute('data-sl-hover');
        hoveredEl = null;
      }
    }
    updateOverlayBoxes();
    postHost('element-select', {
      element: selectedEl ? buildElementInfo(selectedEl) : null
    });
  }

  function startInlineEditing(el) {
    if (!el || !canEditTextDirectly(el)) return;
    selectElement(el);
    editingEl = el;
    el.setAttribute('data-sl-editing', 'true');
    el.setAttribute('data-sl-ce', 'true');
    el.setAttribute('contenteditable', 'true');
    el.setAttribute('spellcheck', 'false');
    el.focus();
    updateOverlayBoxes();
  }

  function getSnapTargets(excludeEl) {
    var root = getCanvasRoot();
    var rootRect = root.getBoundingClientRect();
    var xs = [rootRect.left + 64, rootRect.left + rootRect.width / 2, rootRect.right - 64];
    var ys = [rootRect.top + 48, rootRect.top + rootRect.height / 2, rootRect.bottom - 48];

    var siblings = root.querySelectorAll('[data-object="true"], h1, h2, h3, p, img');
    for (var i = 0; i < Math.min(siblings.length, 40); i++) {
      var s = siblings[i];
      if (s === excludeEl || isEditorNode(s) || excludeEl.contains(s) || s.contains(excludeEl)) continue;
      var r = s.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      xs.push(r.left, r.left + r.width / 2, r.right);
      ys.push(r.top, r.top + r.height / 2, r.bottom);
    }
    return { xs: xs, ys: ys };
  }

  function getResizeCursorForHandle(dir) {
    if (dir === 'nw' || dir === 'se') return 'nwse-resize';
    if (dir === 'ne' || dir === 'sw') return 'nesw-resize';
    if (dir === 'n' || dir === 's') return 'ns-resize';
    return 'ew-resize';
  }

  function mountOverlay() {
    document.documentElement.classList.add('__sl_edit_mode__');
    overlayRoot = document.createElement('div');
    overlayRoot.id = '__slideino_editor_overlay__';
    overlayRoot.setAttribute('data-slideino-editor', 'true');

    hoverBox = document.createElement('div');
    hoverBox.className = '__sl_hover_box__';
    hoverBadge = document.createElement('div');
    hoverBadge.className = '__sl_hover_badge__';
    hoverBox.appendChild(hoverBadge);

    selBox = document.createElement('div');
    selBox.className = '__sl_sel_box__';

    selBadge = document.createElement('div');
    selBadge.className = '__sl_badge__';
    selBox.appendChild(selBadge);

    ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].forEach(function(dir) {
      var h = document.createElement('div');
      h.className = '__sl_handle__';
      h.setAttribute('data-h', dir);
      h.addEventListener('pointerdown', function(e) {
        if (!selectedEl || editingEl) return;
        e.preventDefault();
        e.stopPropagation();
        var cs = window.getComputedStyle(selectedEl);
        var rect = selectedEl.getBoundingClientRect();
        var rootRect = getCanvasRoot().getBoundingClientRect();
        var posMode = cs.position;
        var anchor = getHorizontalAnchor(selectedEl);
        document.documentElement.setAttribute('data-sl-resize-cursor', getResizeCursorForHandle(dir));
        resizeState = {
          handle: dir,
          startX: e.clientX,
          startY: e.clientY,
          startW: rect.width,
          startH: rect.height,
          startLeft: posMode === 'absolute' || posMode === 'fixed'
            ? (Number.isFinite(parseFloat(selectedEl.style.left)) ? parseFloat(selectedEl.style.left) : rect.left - rootRect.left)
            : (parseFloat(selectedEl.style.left) || 0),
          startRight: posMode === 'absolute' || posMode === 'fixed'
            ? (Number.isFinite(parseFloat(selectedEl.style.right)) ? parseFloat(selectedEl.style.right) : rootRect.right - rect.right)
            : 0,
          startTop: posMode === 'absolute' || posMode === 'fixed'
            ? (Number.isFinite(parseFloat(selectedEl.style.top)) ? parseFloat(selectedEl.style.top) : rect.top - rootRect.top)
            : (parseFloat(selectedEl.style.top) || 0),
          posMode: posMode,
          anchor: anchor,
          changed: false
        };
      });
      selBox.appendChild(h);
    });

    guideV = document.createElement('div');
    guideV.className = '__sl_guide_v__';
    guideH = document.createElement('div');
    guideH.className = '__sl_guide_h__';

    overlayRoot.appendChild(hoverBox);
    overlayRoot.appendChild(selBox);
    overlayRoot.appendChild(guideV);
    overlayRoot.appendChild(guideH);
    document.documentElement.appendChild(overlayRoot);
  }

  function ensureLiveGoogleFont(url) {
    if (!url || !document.head) return;
    var existing = document.head.querySelectorAll('link[rel="stylesheet"]');
    for (var i = 0; i < existing.length; i++) {
      if (existing[i].getAttribute('href') === url) return;
    }
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    link.setAttribute('data-slideino-editor', 'true');
    document.head.appendChild(link);
  }

  function applyPatchToElement(el, patch) {
    if (!el || !patch) return;
    var posMode = getOverlayPositionMode(el);
    var anchor = getHorizontalAnchor(el);

    if (typeof patch.textContent === 'string' && hasSimpleDirectText(el)) {
      el.innerText = patch.textContent;
    }
    if (patch.dir !== undefined) {
      if (patch.dir) el.setAttribute('dir', patch.dir);
      else el.removeAttribute('dir');
    }
    if (typeof patch.x === 'number' && Number.isFinite(patch.x)) {
      if (posMode === 'static') {
        el.style.position = 'relative';
        el.style.left = Math.round(patch.x) + 'px';
      } else if (posMode === 'absolute' || posMode === 'fixed') {
        if (anchor === 'right') el.style.right = Math.round(patch.x) + 'px';
        else el.style.left = Math.round(patch.x) + 'px';
      } else {
        el.style.left = Math.round(patch.x) + 'px';
      }
    }
    if (typeof patch.y === 'number' && Number.isFinite(patch.y)) {
      if (posMode === 'static') {
        el.style.position = 'relative';
      }
      el.style.top = Math.round(patch.y) + 'px';
    }
    if (typeof patch.width === 'number' && Number.isFinite(patch.width) && patch.width >= 8) {
      el.style.width = Math.round(patch.width) + 'px';
    }
    if (typeof patch.height === 'number' && Number.isFinite(patch.height) && patch.height >= 4) {
      el.style.height = Math.round(patch.height) + 'px';
    }
    if (typeof patch.zIndex === 'number' && Number.isFinite(patch.zIndex)) {
      if (getOverlayPositionMode(el) === 'static') el.style.position = 'relative';
      el.style.zIndex = String(Math.round(patch.zIndex));
    }
    if (typeof patch.googleFontUrl === 'string' && patch.googleFontUrl) {
      ensureLiveGoogleFont(patch.googleFontUrl);
    }
    if (typeof patch.fontFamily === 'string') {
      el.style.fontFamily = patch.fontFamily;
    }
    if (typeof patch.fontSize === 'number' && Number.isFinite(patch.fontSize)) {
      el.style.fontSize = Math.max(8, Math.min(240, Math.round(patch.fontSize))) + 'px';
    }
    if (typeof patch.fontWeight === 'string') {
      el.style.fontWeight = patch.fontWeight;
    }
    if (typeof patch.fontStyle === 'string') {
      el.style.fontStyle = patch.fontStyle;
    }
    if (typeof patch.textDecoration === 'string') {
      el.style.textDecoration = patch.textDecoration;
    }
    if (typeof patch.textAlign === 'string') {
      el.style.textAlign = patch.textAlign;
    }
    if (typeof patch.color === 'string') {
      el.style.color = patch.color;
    }
    if (typeof patch.lineHeight === 'string') {
      el.style.lineHeight = patch.lineHeight;
    }
    if (typeof patch.letterSpacing === 'string') {
      var trimmedLs = patch.letterSpacing.trim();
      if (trimmedLs === '' || trimmedLs === '0') {
        el.style.letterSpacing = 'normal';
      } else if (/^-?\\d+(\\.\\d+)?$/.test(trimmedLs)) {
        el.style.letterSpacing = trimmedLs + 'px';
      } else {
        el.style.letterSpacing = trimmedLs;
      }
    }
    if (typeof patch.backgroundColor === 'string') {
      el.style.backgroundColor = patch.backgroundColor === 'transparent' ? 'transparent' : patch.backgroundColor;
    }
    if (typeof patch.borderRadius === 'number' && Number.isFinite(patch.borderRadius)) {
      el.style.borderRadius = Math.max(0, Math.round(patch.borderRadius)) + 'px';
    }
    if (typeof patch.opacity === 'number' && Number.isFinite(patch.opacity)) {
      el.style.opacity = String(Math.max(0, Math.min(100, patch.opacity)) / 100);
    }
    if (typeof patch.padding === 'number' && Number.isFinite(patch.padding)) {
      el.style.padding = Math.max(0, Math.round(patch.padding)) + 'px';
    }
    if (el.tagName.toLowerCase() === 'img') {
      if (typeof patch.imgSrc === 'string') el.setAttribute('src', patch.imgSrc);
      if (typeof patch.imgAlt === 'string') el.setAttribute('alt', patch.imgAlt);
      if (typeof patch.objectFit === 'string') el.style.objectFit = patch.objectFit;
    }

    updateOverlayBoxes();
    syncToHost(true);
  }

  function insertNewElement(elementType, imgSrc, imgAlt) {
    var root = getCanvasRoot();
    if (!root) return;
    if (window.getComputedStyle(root).position === 'static') {
      root.style.position = 'relative';
    }
    var rootRect = root.getBoundingClientRect();
    var isRtl = (document.documentElement.getAttribute('dir') || window.getComputedStyle(root).direction) === 'rtl';
    var bodyBg = window.getComputedStyle(root).backgroundColor || window.getComputedStyle(document.body).backgroundColor || '';
    var isDarkSlide = false;
    var m = bodyBg.match(/rgba?\\((\\d+)[,\\s]+(\\d+)[,\\s]+(\\d+)/i);
    if (m) {
      var lum = (0.299 * parseInt(m[1], 10) + 0.587 * parseInt(m[2], 10) + 0.114 * parseInt(m[3], 10)) / 255;
      isDarkSlide = lum < 0.5;
    }
    var inkColor = isDarkSlide ? '#F8FAFC' : '#0F172A';
    var surfaceBg = isDarkSlide ? 'rgba(30, 41, 59, 0.85)' : 'rgba(241, 245, 249, 0.92)';
    var borderCol = isDarkSlide ? 'rgba(148, 163, 184, 0.25)' : 'rgba(15, 23, 42, 0.15)';
    var fontStack = window.getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';

    var el;
    if (elementType === 'heading') {
      el = document.createElement('div');
      el.setAttribute('data-object', 'true');
      el.setAttribute('data-object-type', 'textbox');
      el.textContent = isRtl ? 'عنوان جدید اسلاید' : 'New Slide Heading';
      el.style.cssText = 'position:absolute;left:' + Math.round(rootRect.width / 2 - 260) + 'px;top:' + Math.round(rootRect.height / 2 - 40) + 'px;width:520px;min-height:56px;z-index:20;font-size:40px;font-weight:700;line-height:1.2;color:' + inkColor + ';font-family:' + fontStack + ';text-align:' + (isRtl ? 'right' : 'left') + ';';
    } else if (elementType === 'text') {
      el = document.createElement('div');
      el.setAttribute('data-object', 'true');
      el.setAttribute('data-object-type', 'textbox');
      el.textContent = isRtl ? 'برای ویرایش متن دو بار کلیک کنید.' : 'Double-click to edit this text block.';
      el.style.cssText = 'position:absolute;left:' + Math.round(rootRect.width / 2 - 220) + 'px;top:' + Math.round(rootRect.height / 2 - 24) + 'px;width:440px;min-height:48px;z-index:20;font-size:20px;font-weight:400;line-height:1.5;color:' + inkColor + ';font-family:' + fontStack + ';text-align:' + (isRtl ? 'right' : 'left') + ';';
    } else if (elementType === 'shape') {
      el = document.createElement('div');
      el.setAttribute('data-object', 'true');
      el.setAttribute('data-object-type', 'shape');
      el.style.cssText = 'position:absolute;left:' + Math.round(rootRect.width / 2 - 140) + 'px;top:' + Math.round(rootRect.height / 2 - 90) + 'px;width:280px;height:180px;z-index:15;background-color:' + surfaceBg + ';border:1px solid ' + borderCol + ';border-radius:12px;';
    } else if (elementType === 'divider') {
      el = document.createElement('div');
      el.setAttribute('data-object', 'true');
      el.setAttribute('data-object-type', 'shape');
      el.style.cssText = 'position:absolute;left:' + Math.round(rootRect.width / 2 - 200) + 'px;top:' + Math.round(rootRect.height / 2) + 'px;width:400px;height:3px;z-index:18;background-color:#2563EB;border-radius:2px;';
    } else if (elementType === 'image' && imgSrc) {
      el = document.createElement('img');
      el.setAttribute('data-object', 'true');
      el.setAttribute('src', imgSrc);
      el.setAttribute('alt', imgAlt || 'Inserted slide visual');
      el.setAttribute('referrerpolicy', 'no-referrer');
      el.style.cssText = 'position:absolute;left:' + Math.round(rootRect.width / 2 - 200) + 'px;top:' + Math.round(rootRect.height / 2 - 130) + 'px;width:400px;height:260px;z-index:18;object-fit:cover;border-radius:10px;';
    } else {
      return;
    }

    root.appendChild(el);
    selectElement(el);
    syncToHost(true);
    if (elementType === 'heading' || elementType === 'text') {
      startInlineEditing(el);
    }
  }

  function deleteSelected() {
    if (!selectedEl || isCanvasShell(selectedEl)) return;
    stopInlineEditing(false);
    var toRemove = selectedEl;
    selectedEl = null;
    toRemove.remove();
    updateOverlayBoxes();
    postHost('element-select', { element: null });
    syncToHost(true);
  }

  function duplicateSelected() {
    if (!selectedEl || isCanvasShell(selectedEl) || !selectedEl.parentElement) return;
    stopInlineEditing(true);
    var clone = selectedEl.cloneNode(true);
    clone.removeAttribute('data-sl-id');
    clone.querySelectorAll('[data-sl-id]').forEach(function(n) { n.removeAttribute('data-sl-id'); });
    var posMode = getOverlayPositionMode(selectedEl);
    if (posMode === 'absolute' || posMode === 'fixed') {
      var anchor = getHorizontalAnchor(selectedEl);
      if (anchor === 'right') {
        var r = parseFloat(selectedEl.style.right) || 0;
        clone.style.right = Math.round(r + 20) + 'px';
      } else {
        var l = parseFloat(selectedEl.style.left) || 0;
        clone.style.left = Math.round(l + 20) + 'px';
      }
      var t = parseFloat(selectedEl.style.top) || 0;
      clone.style.top = Math.round(t + 20) + 'px';
    }
    selectedEl.parentElement.insertBefore(clone, selectedEl.nextSibling);
    selectElement(clone);
    syncToHost(true);
  }

  function reorderZ(direction) {
    if (!selectedEl) return;
    if (getOverlayPositionMode(selectedEl) === 'static') {
      selectedEl.style.position = 'relative';
    }
    var cur = parseInt(window.getComputedStyle(selectedEl).zIndex, 10);
    if (!Number.isFinite(cur)) cur = 1;
    if (direction === 'forward') selectedEl.style.zIndex = String(cur + 1);
    else if (direction === 'backward') selectedEl.style.zIndex = String(Math.max(0, cur - 1));
    else if (direction === 'front') selectedEl.style.zIndex = String(Math.max(50, cur + 10));
    else if (direction === 'back') selectedEl.style.zIndex = '0';
    syncToHost(true);
  }

  function setupListeners() {
    document.addEventListener('pointermove', function(e) {
      if (resizeState && selectedEl) {
        e.preventDefault();
        var dx = e.clientX - resizeState.startX;
        var dy = e.clientY - resizeState.startY;
        var h = resizeState.handle;
        var newW = resizeState.startW;
        var newH = resizeState.startH;
        var newLeft = resizeState.startLeft;
        var newRight = resizeState.startRight;
        var newTop = resizeState.startTop;

        if (h.indexOf('e') !== -1) {
          newW = Math.max(12, resizeState.startW + dx);
          if (resizeState.anchor === 'right' && (resizeState.posMode === 'absolute' || resizeState.posMode === 'fixed')) {
            newRight = resizeState.startRight - (newW - resizeState.startW);
          }
        }
        if (h.indexOf('w') !== -1) {
          newW = Math.max(12, resizeState.startW - dx);
          if (resizeState.anchor === 'left' && (resizeState.posMode === 'absolute' || resizeState.posMode === 'fixed')) {
            newLeft = resizeState.startLeft + (resizeState.startW - newW);
          }
        }
        if (h.indexOf('s') !== -1) {
          newH = Math.max(4, resizeState.startH + dy);
        }
        if (h.indexOf('n') !== -1) {
          newH = Math.max(4, resizeState.startH - dy);
          if (resizeState.posMode === 'absolute' || resizeState.posMode === 'fixed') {
            newTop = resizeState.startTop + (resizeState.startH - newH);
          }
        }

        selectedEl.style.width = Math.round(newW) + 'px';
        selectedEl.style.height = Math.round(newH) + 'px';
        if (resizeState.posMode === 'absolute' || resizeState.posMode === 'fixed') {
          if (resizeState.anchor === 'right') selectedEl.style.right = Math.round(newRight) + 'px';
          else selectedEl.style.left = Math.round(newLeft) + 'px';
          selectedEl.style.top = Math.round(newTop) + 'px';
        }
        resizeState.changed = true;
        updateOverlayBoxes();
        return;
      }

      if (dragState && selectedEl) {
        var moveDx = e.clientX - dragState.startX;
        var moveDy = e.clientY - dragState.startY;
        if (!dragState.active && Math.hypot(moveDx, moveDy) < 4) return;
        if (!dragState.active) {
          dragState.active = true;
          document.documentElement.classList.add('__sl_dragging__');
          setHoveredElement(null);
        }
        e.preventDefault();

        var appliedDx = moveDx;
        var appliedDy = moveDy;
        var snappedV = null;
        var snappedH = null;

        if (snapEnabled && !e.altKey && (dragState.posMode === 'absolute' || dragState.posMode === 'fixed')) {
          var threshold = 6;
          var targetLeft = dragState.startRectLeft + moveDx;
          var targetCenterX = targetLeft + dragState.startW / 2;
          var targetRight = targetLeft + dragState.startW;
          var bestDx = null;
          var bestDxDist = threshold + 1;

          for (var i = 0; i < dragState.snap.xs.length; i++) {
            var sx = dragState.snap.xs[i];
            var d1 = sx - targetLeft;
            var d2 = sx - targetCenterX;
            var d3 = sx - targetRight;
            if (Math.abs(d1) < bestDxDist) { bestDxDist = Math.abs(d1); bestDx = d1; snappedV = sx; }
            if (Math.abs(d2) < bestDxDist) { bestDxDist = Math.abs(d2); bestDx = d2; snappedV = sx; }
            if (Math.abs(d3) < bestDxDist) { bestDxDist = Math.abs(d3); bestDx = d3; snappedV = sx; }
          }
          if (bestDx !== null) appliedDx = moveDx + bestDx;
          else snappedV = null;

          var targetTop = dragState.startRectTop + moveDy;
          var targetCenterY = targetTop + dragState.startH / 2;
          var targetBottom = targetTop + dragState.startH;
          var bestDy = null;
          var bestDyDist = threshold + 1;

          for (var j = 0; j < dragState.snap.ys.length; j++) {
            var sy = dragState.snap.ys[j];
            var e1 = sy - targetTop;
            var e2 = sy - targetCenterY;
            var e3 = sy - targetBottom;
            if (Math.abs(e1) < bestDyDist) { bestDyDist = Math.abs(e1); bestDy = e1; snappedH = sy; }
            if (Math.abs(e2) < bestDyDist) { bestDyDist = Math.abs(e2); bestDy = e2; snappedH = sy; }
            if (Math.abs(e3) < bestDyDist) { bestDyDist = Math.abs(e3); bestDy = e3; snappedH = sy; }
          }
          if (bestDy !== null) appliedDy = moveDy + bestDy;
          else snappedH = null;
        }

        showGuides(snappedV, snappedH);

        if (dragState.posMode === 'absolute' || dragState.posMode === 'fixed') {
          if (dragState.anchor === 'right') {
            selectedEl.style.right = Math.round(dragState.startRight - appliedDx) + 'px';
          } else {
            selectedEl.style.left = Math.round(dragState.startLeft + appliedDx) + 'px';
          }
          selectedEl.style.top = Math.round(dragState.startTop + appliedDy) + 'px';
        } else {
          if (dragState.posMode === 'static') selectedEl.style.position = 'relative';
          selectedEl.style.left = Math.round(dragState.startLeft + appliedDx) + 'px';
          selectedEl.style.top = Math.round(dragState.startTop + appliedDy) + 'px';
        }

        updateOverlayBoxes();
        return;
      }

      if (editingEl) return;
      // When hovering inside the already-selected element, keep move cursor without showing hover box
      if (selectedEl && document.contains(selectedEl) && selectedEl.contains(e.target) && !(e.metaKey || e.ctrlKey)) {
        setHoveredElement(null);
        return;
      }
      var candidate = (e.metaKey || e.ctrlKey)
        ? (!isEditorNode(e.target) && !isCanvasShell(e.target) ? e.target : null)
        : resolveClickableTarget(e.target, false);
      setHoveredElement(candidate);
    }, true);

    document.addEventListener('pointerleave', function() {
      if (!dragState && !resizeState) {
        setHoveredElement(null);
      }
    });

    document.addEventListener('pointerdown', function(e) {
      if (e.button !== 0) return;
      if (isEditorNode(e.target)) return;

      if (editingEl) {
        if (editingEl.contains(e.target)) return;
        stopInlineEditing(true);
      }

      // Prevent links/buttons from navigating while editing
      if (e.target.closest && e.target.closest('a, button')) {
        e.preventDefault();
      }

      var deepSelect = Boolean(e.metaKey || e.ctrlKey);

      // Step 2: If pressing down on an ALREADY selected element (blue border visible), prepare to move it.
      if (!deepSelect && selectedEl && document.contains(selectedEl) && selectedEl.contains(e.target)) {
        var cs = window.getComputedStyle(selectedEl);
        var rect = selectedEl.getBoundingClientRect();
        var rootRect = getCanvasRoot().getBoundingClientRect();
        var posMode = cs.position;
        var anchor = getHorizontalAnchor(selectedEl);

        dragState = {
          startX: e.clientX,
          startY: e.clientY,
          startRectLeft: rect.left,
          startRectTop: rect.top,
          startW: rect.width,
          startH: rect.height,
          startLeft: posMode === 'absolute' || posMode === 'fixed'
            ? (Number.isFinite(parseFloat(selectedEl.style.left)) ? parseFloat(selectedEl.style.left) : rect.left - rootRect.left)
            : (parseFloat(selectedEl.style.left) || 0),
          startRight: posMode === 'absolute' || posMode === 'fixed'
            ? (Number.isFinite(parseFloat(selectedEl.style.right)) ? parseFloat(selectedEl.style.right) : rootRect.right - rect.right)
            : 0,
          startTop: posMode === 'absolute' || posMode === 'fixed'
            ? (Number.isFinite(parseFloat(selectedEl.style.top)) ? parseFloat(selectedEl.style.top) : rect.top - rootRect.top)
            : (parseFloat(selectedEl.style.top) || 0),
          posMode: posMode,
          anchor: anchor,
          snap: getSnapTargets(selectedEl),
          active: false
        };
        return;
      }

      // Step 1: Clicking an UNSELECTED element ONLY selects it (shows blue border) — never drags on first click.
      var target = deepSelect
        ? (!isEditorNode(e.target) && !isCanvasShell(e.target) ? e.target : null)
        : resolveClickableTarget(e.target, false);
      dragState = null;
      if (!target) {
        selectElement(null);
        return;
      }
      selectElement(target);
    }, true);

    window.addEventListener('pointerup', function() {
      if (resizeState) {
        var didResize = resizeState.changed;
        resizeState = null;
        document.documentElement.removeAttribute('data-sl-resize-cursor');
        if (didResize) syncToHost(true);
      }
      if (dragState) {
        var didDrag = dragState.active;
        dragState = null;
        document.documentElement.classList.remove('__sl_dragging__');
        hideGuides();
        if (didDrag) syncToHost(true);
      }
    }, true);

    document.addEventListener('dblclick', function(e) {
      if (isEditorNode(e.target)) return;
      var raw = e.target;
      if (isCanvasShell(raw)) return;
      var target = canEditTextDirectly(raw) ? raw : resolveClickableTarget(raw, true);
      if (target && canEditTextDirectly(target)) {
        e.preventDefault();
        e.stopPropagation();
        startInlineEditing(target);
      }
    }, true);

    document.addEventListener('input', function() {
      if (editingEl) {
        updateOverlayBoxes();
        syncToHost(false);
      }
    }, true);

    document.addEventListener('keydown', function(e) {
      var mod = e.metaKey || e.ctrlKey;

      if (editingEl) {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          stopInlineEditing(true);
        }
        return;
      }

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.stopPropagation();
        postHost(e.shiftKey ? 'editor-redo' : 'editor-undo', {});
        return;
      }

      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        e.stopPropagation();
        postHost('editor-redo', {});
        return;
      }

      if (!selectedEl) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        selectElement(null);
        return;
      }

      if (e.key === 'Enter' && canEditTextDirectly(selectedEl)) {
        e.preventDefault();
        e.stopPropagation();
        startInlineEditing(selectedEl);
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        e.stopPropagation();
        deleteSelected();
        return;
      }

      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        e.stopPropagation();
        duplicateSelected();
        return;
      }

      var step = e.shiftKey ? 10 : 1;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.key) !== -1) {
        e.preventDefault();
        e.stopPropagation();
        var posMode = getOverlayPositionMode(selectedEl);
        var anchor = getHorizontalAnchor(selectedEl);
        var rect = selectedEl.getBoundingClientRect();
        var rootRect = getCanvasRoot().getBoundingClientRect();
        if (posMode === 'static') selectedEl.style.position = 'relative';

        var curLeft = posMode === 'absolute' || posMode === 'fixed'
          ? (Number.isFinite(parseFloat(selectedEl.style.left)) ? parseFloat(selectedEl.style.left) : rect.left - rootRect.left)
          : (parseFloat(selectedEl.style.left) || 0);
        var curRight = posMode === 'absolute' || posMode === 'fixed'
          ? (Number.isFinite(parseFloat(selectedEl.style.right)) ? parseFloat(selectedEl.style.right) : rootRect.right - rect.right)
          : 0;
        var curTop = posMode === 'absolute' || posMode === 'fixed'
          ? (Number.isFinite(parseFloat(selectedEl.style.top)) ? parseFloat(selectedEl.style.top) : rect.top - rootRect.top)
          : (parseFloat(selectedEl.style.top) || 0);

        if (e.key === 'ArrowLeft') {
          if (anchor === 'right' && (posMode === 'absolute' || posMode === 'fixed')) selectedEl.style.right = Math.round(curRight + step) + 'px';
          else selectedEl.style.left = Math.round(curLeft - step) + 'px';
        } else if (e.key === 'ArrowRight') {
          if (anchor === 'right' && (posMode === 'absolute' || posMode === 'fixed')) selectedEl.style.right = Math.round(curRight - step) + 'px';
          else selectedEl.style.left = Math.round(curLeft + step) + 'px';
        } else if (e.key === 'ArrowUp') {
          selectedEl.style.top = Math.round(curTop - step) + 'px';
        } else if (e.key === 'ArrowDown') {
          selectedEl.style.top = Math.round(curTop + step) + 'px';
        }

        updateOverlayBoxes();
        syncToHost(true);
      }
    }, true);

    window.addEventListener('message', function(e) {
      var data = e.data;
      if (!data || data.source !== 'slideino-host' || data.instanceId !== INSTANCE_ID) return;
      var cmd = data.command;
      if (!cmd || typeof cmd.type !== 'string') return;

      if (cmd.type === 'select-element') {
        if (!cmd.id) {
          selectElement(null);
        } else {
          var target = document.querySelector('[data-sl-id="' + cmd.id + '"]');
          if (target) selectElement(target);
        }
      } else if (cmd.type === 'select-parent') {
        if (selectedEl && selectedEl.parentElement && !isCanvasShell(selectedEl.parentElement)) {
          selectElement(selectedEl.parentElement);
        }
      } else if (cmd.type === 'update-element') {
        var elToUpdate = cmd.id ? document.querySelector('[data-sl-id="' + cmd.id + '"]') : selectedEl;
        if (elToUpdate) {
          applyPatchToElement(elToUpdate, cmd.patch);
        }
      } else if (cmd.type === 'delete-selected') {
        deleteSelected();
      } else if (cmd.type === 'duplicate-selected') {
        duplicateSelected();
      } else if (cmd.type === 'reorder-z') {
        reorderZ(cmd.direction);
      } else if (cmd.type === 'insert-element') {
        insertNewElement(cmd.elementType, cmd.imgSrc, cmd.imgAlt);
      } else if (cmd.type === 'set-slide-dir') {
        document.documentElement.setAttribute('dir', cmd.dir);
        if (document.body) document.body.style.direction = cmd.dir;
        updateOverlayBoxes();
        syncToHost(true);
      } else if (cmd.type === 'set-snap') {
        snapEnabled = Boolean(cmd.enabled);
      } else if (cmd.type === 'request-layers') {
        emitLayers();
      }
    });

    window.addEventListener('blur', function() {
      if (editingEl) {
        stopInlineEditing(true);
      }
    });

    window.addEventListener('resize', updateOverlayBoxes);
    window.addEventListener('scroll', updateOverlayBoxes, true);
  }

  function boot() {
    mountOverlay();
    setupListeners();
    setTimeout(emitLayers, 60);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
</script>`;
}
