// sheets.js
// Загружает CSV из Google Sheets и превращает в объект productsData
// Ожидаемые заголовки (в любом регистре, но лучше совпадать): name OR title, description, price, currency, unit, availability, sku

const SHEETS_CSV_URL = "https://docs.google.com/spreadsheets/d/1gcciGJgrT7NQNj4qWOMtS7C854nDXCi2XVwxTZmhGC8/export?format=csv";

window.productsData = {}; // глобально доступно модалке

// Простой, но поддерживающий кавычки парсер CSV (учитывает поля в кавычках)
function parseCSV(text) {
  const rows = [];
  let cur = '';
  let row = [];
  let i = 0;
  let inQuotes = false;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"' ) {
      if (inQuotes && text[i+1] === '"') { // escaped quote
        cur += '"';
        i += 2;
        continue;
      }
      inQuotes = !inQuotes;
      i++;
      continue;
    }
    if (!inQuotes && (ch === ',' || ch === '\n' || ch === '\r')) {
      // end of cell
      row.push(cur);
      cur = '';
      // handle different newline styles
      if (ch === ',') {
        i++;
        continue;
      }
      // newline -> push row
      // skip possible \r\n combination
      if (ch === '\r' && text[i+1] === '\n') i++;
      rows.push(row);
      row = [];
      i++;
      continue;
    }
    cur += ch;
    i++;
  }
  // push last cell/row
  if (cur.length > 0 || inQuotes) row.push(cur);
  if (row.length > 0) rows.push(row);
  return rows;
}

function normalizeHeader(h) {
  return String(h || '').trim().toLowerCase();
}

function loadSheets() {
  return fetch(SHEETS_CSV_URL)
    .then(resp => {
      if (!resp.ok) throw new Error("Network response not ok");
      return resp.text();
    })
    .then(csvText => {
      if (!csvText || csvText.trim().length === 0) throw new Error("Empty CSV");
      const rows = parseCSV(csvText);
      if (!rows || rows.length === 0) throw new Error("No rows parsed");
      const rawHeaders = rows.shift();
      const headers = rawHeaders.map(normalizeHeader);

      const nameKey = headers.includes('name') ? 'name' : (headers.includes('title') ? 'title' : null);
      if (!nameKey) console.warn("CSV не содержит 'name' или 'title' заголовка. Использую первый столбец как ключ.");

      const data = {};
      rows.forEach((r) => {
        // normalize row length
        while (r.length < headers.length) r.push('');
        const obj = {};
        headers.forEach((h, idx) => {
          obj[h] = r[idx] !== undefined ? String(r[idx]).trim() : '';
        });
        const key = nameKey ? obj[nameKey] : obj[headers[0]];
        if (key) {
          data[key] = obj;
        }
      });

      window.productsData = data;
      // dispatch событие, чтобы модалка знала, что данные пришли
      document.dispatchEvent(new CustomEvent('sheets:loaded', { detail: { count: Object.keys(data).length } }));
      return data;
    });
}

// Попробуем загрузить, но не ломаем страницу если не получится
loadSheets().catch(err => {
  console.warn("Помилка при завантаженні таблиці:", err && err.message);
  // оставляем window.productsData пустым — модалка покажет fallback
});
// modal.js
(function () {
  const modal = document.getElementById('modal');
  const modalImage = document.getElementById('modal-image');
  const modalTitle = document.getElementById('modal-title');
  const modalDescription = document.getElementById('modal-description');
  const modalPrice = document.getElementById('modal-price');
  const modalUnit = document.getElementById('modal-unit');
  const modalAvailability = document.getElementById('modal-availability');
  const modalSKU = document.getElementById('modal-sku');
  const closeBtn = document.querySelector('.modal-content .close');

  function openModalForKey(key) {
    const data = (window.productsData && window.productsData[key]) ? window.productsData[key] : null;

    // берем картинку из карточки
    const card = Array.from(document.querySelectorAll('.product-card')).find(c => c.dataset.key === key);
    if (card) {
      const img = card.querySelector('img');
      if (img) {
        modalImage.src = img.src || '';
        modalImage.alt = img.alt || key;
        modalImage.style.display = '';
      } else {
        modalImage.src = '';
        modalImage.alt = '';
        modalImage.style.display = 'none';
      }
    } else {
      modalImage.src = '';
      modalImage.alt = '';
      modalImage.style.display = 'none';
    }

    modalTitle.textContent = key;

    // Описание — ставим textContent (без HTML), чтобы переносы работали корректно
    if (data && data.description) {
      modalDescription.textContent = data.description;
    } else {
      modalDescription.textContent = "Інформація недоступна";
    }

    // Цена и другие поля — если есть, показываем, иначе дефолт
    modalPrice.textContent = (data && (data.price || data.currency)) ? ((data.price || '') + (data.currency ? ' ' + data.currency : '')) : '—';
    modalUnit.textContent = (data && data.unit) ? data.unit : '—';
    modalAvailability.textContent = (data && data.availability) ? data.availability : '—';
    modalSKU.textContent = (data && data.sku) ? data.sku : '—';

    // aria и фокус
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    modal._lastFocus = document.activeElement;
    closeBtn.focus();

    // блокируем скролл фона
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');

    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';

    // возвращаем фокус
    if (modal._lastFocus) modal._lastFocus.focus();
  }

  // навешиваем события на карточки
  function attachCardHandlers() {
    document.querySelectorAll('.product-card').forEach(card => {
      const key = card.dataset.key;
      if (!key) return;
      card.addEventListener('click', () => openModalForKey(key));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          openModalForKey(key);
        }
      });
    });
  }

  // закрытие
  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('show')) closeModal();
  });

  // init
  attachCardHandlers();

  // если данные из sheets придут позже и ты хочешь как-то обновить — событие 'sheets:loaded' отправляется
  document.addEventListener('sheets:loaded', () => {
    // можно что-то сделать при приходе данных (напр., лог)
    // console.log('sheets loaded');
  });

})();
