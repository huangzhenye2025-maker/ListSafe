/**
 * Mock Etsy Listing Editor Demo Controller (with Multi-Language i18n Support)
 */

document.addEventListener('DOMContentLoaded', async () => {
  const titleInput = document.getElementById('title');
  const tagsInput = document.getElementById('tags');
  const descInput = document.getElementById('description');
  const titleCount = document.getElementById('title-char-count');
  const tagsChipsDisplay = document.getElementById('tags-chips-display');
  const demoLangSwitcher = document.getElementById('demo-lang-switcher');

  // Initialize i18n
  if (window.ListSafeI18n) {
    const currentLang = await window.ListSafeI18n.initLanguage();
    if (demoLangSwitcher) demoLangSwitcher.value = currentLang;
    window.ListSafeI18n.applyDomTranslations();
  }

  // Language switcher event listener
  if (demoLangSwitcher) {
    demoLangSwitcher.addEventListener('change', () => {
      const selectedLang = demoLangSwitcher.value;
      if (window.ListSafeI18n) {
        window.ListSafeI18n.setLanguage(selectedLang);
        window.ListSafeI18n.applyDomTranslations();
        if (window.ListSafe && window.ListSafe.refreshLanguage) {
          window.ListSafe.refreshLanguage();
        }
      }
    });
  }

  // Presets definition
  const PRESETS = {
    mothersday: {
      title: "Vintage Boy Mom Sweatshirt Cute Mama Bear Shirt Retro Onesie Gift for Her",
      tags: "boy mom, mama bear, onesie, super bowl party, mother gift, oversized sweatshirt, cozy pullover, retro aesthetic",
      description: "Celebrate Mother's Day with this vintage boy mom sweatshirt! Featuring cute mama bear graphics and super soft fleece."
    },
    popculture: {
      title: "Custom Swiftie Stanley Cup 40oz Tumbler with Disney Mickey Ears & Barbie Pink Bow",
      tags: "stanley cup, swiftie, disney, barbie pink, croc charms, tumbler accessories, gifts for teens",
      description: "The ultimate 40oz tumbler for any true Swiftie! Comes with cute Barbie pink lid topper and Disney inspired keychain."
    },
    svgcraft: {
      title: "Cricut Cut File Seven Slot Jeep Grill SVG Slogan Tupperware Decal Sticker Bundle",
      tags: "cricut maker, jeep grill, tupperware, sharpie, svg cut file, vinyl decal, laser cut",
      description: "Instant digital download for Cricut and Silhouette cutting machines. Includes seven slot jeep grill cut file and kitchen decals."
    },
    safe: {
      title: "Artisan Mother of Boys Sweatshirt Protective Mama Cozy Apparel Aesthetic Gift",
      tags: "mother of boys, protective mama, mama clothing, cozy crewneck, autumn sweater, gift for mom, cotton fleece",
      description: "Handcrafted premium fleece sweater designed for mothers. Ultra-soft breathable organic cotton."
    }
  };

  /**
   * Update character counters
   */
  function updateCounters() {
    if (titleInput && titleCount) {
      titleCount.textContent = `${titleInput.value.length}/140`;
    }
    updateTagChips();
  }

  function updateTagChips() {
    if (!tagsInput || !tagsChipsDisplay) return;
    const rawTags = (tagsInput.value || '').split(/[,;\n]+/).map(t => t.trim()).filter(Boolean);

    if (rawTags.length === 0) {
      tagsChipsDisplay.innerHTML = '<span style="font-size:12px; color:#94a3b8;">No tags added yet. Enter comma-separated keywords above.</span>';
      return;
    }

    tagsChipsDisplay.innerHTML = rawTags.map((tag, idx) => {
      return `
        <span class="tag-chip">
          <span>${tag}</span>
          <span class="tag-chip-remove" data-idx="${idx}">✕</span>
        </span>
      `;
    }).join('');

    tagsChipsDisplay.querySelectorAll('.tag-chip-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        rawTags.splice(idx, 1);
        tagsInput.value = rawTags.join(', ');
        triggerInputEvents(tagsInput);
      });
    });
  }

  function triggerInputEvents(el) {
    if (!el) return;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    updateCounters();
  }

  function loadPreset(presetKey) {
    const data = PRESETS[presetKey];
    if (!data) return;

    titleInput.value = data.title;
    tagsInput.value = data.tags;
    descInput.value = data.description;

    triggerInputEvents(titleInput);
    triggerInputEvents(tagsInput);
    triggerInputEvents(descInput);

    if (window.ListSafe && window.ListSafe.scan) {
      window.ListSafe.scan();
    }
  }

  // Bind Preset Buttons
  document.querySelectorAll('.btn-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = btn.getAttribute('data-preset');
      if (preset === 'clear') {
        titleInput.value = '';
        tagsInput.value = '';
        descInput.value = '';
        triggerInputEvents(titleInput);
        triggerInputEvents(tagsInput);
        triggerInputEvents(descInput);
        if (window.ListSafe && window.ListSafe.scan) {
          window.ListSafe.scan();
        }
      } else {
        loadPreset(preset);
      }
    });
  });

  titleInput.addEventListener('input', updateCounters);
  tagsInput.addEventListener('input', updateCounters);

  // Check file:// protocol limitation
  if (window.location.protocol === 'file:') {
    const fileNotice = document.createElement('div');
    fileNotice.style.cssText = 'background: #fffbeb; border-bottom: 1px solid #fef3c7; color: #92400e; padding: 10px 20px; font-size: 13px; font-weight: 500; text-align: center; font-family: system-ui, sans-serif;';
    fileNotice.innerHTML = '💡 <strong>Local Browser Tip:</strong> When opened directly via <code>file://</code>, Chrome blocks local JSON requests. For full live scanning, start a local server: <code>python -m http.server 8000</code> and visit <a href="http://localhost:8000/demo/mock-etsy-editor.html" style="color:#d97706; text-decoration:underline;">http://localhost:8000/demo/mock-etsy-editor.html</a>';
    document.body.insertBefore(fileNotice, document.body.firstChild);
  }

  // Load default high-risk preset on start to demonstrate immediate value
  loadPreset('mothersday');
});
