/* ====================================================
   MRP System â€” Enhanced Application Logic
   Multi-level BOM Â· Lot Sizing Â· Safety Stock Â· Capacity Â· Gantt Â· CSV
   ==================================================== */

const Store = (() => {
  const KEYS = {
    products: 'mrp_products', bom: 'mrp_bom', inventory: 'mrp_inventory',
    demands: 'mrp_demands', mrpResult: 'mrp_result', capacity: 'mrp_capacity',
  };
  function load(key) { try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; } }
  function save(key, data) { localStorage.setItem(key, JSON.stringify(data)); }
  return {
    getProducts()   { return load(KEYS.products); },
    setProducts(d)  { save(KEYS.products, d); },
    getBom()        { return load(KEYS.bom); },
    setBom(d)       { save(KEYS.bom, d); },
    getInventory()  { return load(KEYS.inventory); },
    setInventory(d) { save(KEYS.inventory, d); },
    getDemands()    { return load(KEYS.demands); },
    setDemands(d)   { save(KEYS.demands, d); },
    getMrpResult()  { try { return JSON.parse(localStorage.getItem(KEYS.mrpResult)); } catch { return null; } },
    setMrpResult(d) { save(KEYS.mrpResult, d); },
    getCapacity()   { return parseInt(localStorage.getItem(KEYS.capacity)) || 100; },
    setCapacity(v)  { localStorage.setItem(KEYS.capacity, String(v)); },
    clearAll()      { Object.values(KEYS).forEach(k => localStorage.removeItem(k)); }
  };
})();

// â”€â”€â”€ TOAST â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3400);
}

// â”€â”€â”€ TAB NAVIGATION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function initNavigation() {
  const navBtns = document.querySelectorAll('.sidebar-nav .nav-btn');
  const panels = document.querySelectorAll('.tab-panel');
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      navBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      panels.forEach(p => p.classList.toggle('active', p.id === `tab-${tabId}`));
      if (tabId === 'dashboard') refreshDashboard();
      if (tabId === 'master-data') refreshMasterData();
      if (tabId === 'demand') refreshDemandTab();
      if (tabId === 'mrp-output') refreshMrpOutput();
    });
  });
  const subTabs = document.querySelectorAll('.sub-tab');
  const subPanels = document.querySelectorAll('.sub-panel');
  subTabs.forEach(st => {
    st.addEventListener('click', () => {
      const target = st.dataset.subtab;
      subTabs.forEach(s => s.classList.remove('active'));
      st.classList.add('active');
      subPanels.forEach(sp => sp.classList.toggle('active', sp.id === `sub-${target}`));
    });
  });
}

// â”€â”€â”€ PRODUCT MANAGEMENT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function initProductForm() {
  document.getElementById('form-product').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('inp-product-id').value.trim().toUpperCase();
    const name = document.getElementById('inp-product-name').value.trim();
    if (!id || !name) return showToast('Please fill all fields', 'error');
    const products = Store.getProducts();
    if (products.find(p => p.id === id)) return showToast(`Product ${id} already exists`, 'error');
    products.push({ id, name });
    Store.setProducts(products);
    e.target.reset();
    renderProductsTable();
    refreshProductSelects();
    showToast(`Product "${name}" added`, 'success');
  });
}

function renderProductsTable() {
  const tbody = document.querySelector('#tbl-products tbody');
  const products = Store.getProducts();
  if (products.length === 0) { tbody.innerHTML = '<tr><td colspan="3" class="empty-msg">No products added yet</td></tr>'; return; }
  tbody.innerHTML = products.map(p => `
    <tr>
      <td><span class="badge badge-blue">${esc(p.id)}</span></td>
      <td>${esc(p.name)}</td>
      <td><button class="btn btn-sm btn-danger-outline" onclick="deleteProduct('${esc(p.id)}')">Delete</button></td>
    </tr>`).join('');
}

function deleteProduct(id) {
  Store.setProducts(Store.getProducts().filter(p => p.id !== id));
  Store.setBom(Store.getBom().filter(b => b.productId !== id));
  Store.setDemands(Store.getDemands().filter(d => d.productId !== id));
  renderProductsTable(); refreshProductSelects();
  showToast(`Product ${id} deleted`, 'info');
}

// â”€â”€â”€ BOM MANAGEMENT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function initBomForm() {
  document.getElementById('form-bom').addEventListener('submit', (e) => {
    e.preventDefault();
    const productId = document.getElementById('sel-bom-product').value;
    const componentId = document.getElementById('inp-bom-component').value.trim().toUpperCase();
    const componentName = document.getElementById('inp-bom-component-name').value.trim();
    const qtyPerUnit = parseFloat(document.getElementById('inp-bom-qty').value);
    if (!productId || !componentId || !componentName || isNaN(qtyPerUnit) || qtyPerUnit <= 0)
      return showToast('Please fill all fields correctly', 'error');
    if (productId === componentId) return showToast('A product cannot be its own component', 'error');
    const bom = Store.getBom();
    if (bom.find(b => b.productId === productId && b.componentId === componentId))
      return showToast('This BOM entry already exists', 'error');
    bom.push({ productId, componentId, componentName, qtyPerUnit });
    Store.setBom(bom);
    e.target.reset();
    renderBomTable();
    showToast(`BOM entry added: ${componentName} â†’ ${productId}`, 'success');
  });
}

function renderBomTable() {
  const tbody = document.querySelector('#tbl-bom tbody');
  const bom = Store.getBom();
  const products = Store.getProducts();
  if (bom.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="empty-msg">No BOM entries yet</td></tr>'; return; }
  tbody.innerHTML = bom.map(b => {
    const prod = products.find(p => p.id === b.productId);
    const isSubAsm = bom.some(x => x.productId === b.componentId);
    return `<tr>
      <td><span class="badge badge-blue">${esc(b.productId)}</span> ${prod ? esc(prod.name) : ''}</td>
      <td>${esc(b.componentId)} ${isSubAsm ? '<span class="badge badge-purple" style="font-size:0.68rem">Sub-Asm</span>' : ''}</td>
      <td>${esc(b.componentName)}</td>
      <td>${b.qtyPerUnit}</td>
      <td><button class="btn btn-sm btn-danger-outline" onclick="deleteBom('${esc(b.productId)}','${esc(b.componentId)}')">Delete</button></td>
    </tr>`;
  }).join('');
}

function deleteBom(productId, componentId) {
  Store.setBom(Store.getBom().filter(b => !(b.productId === productId && b.componentId === componentId)));
  renderBomTable();
  showToast('BOM entry removed', 'info');
}

// â”€â”€â”€ INVENTORY MANAGEMENT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function initInventoryForm() {
  document.getElementById('form-inventory').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('inp-inv-id').value.trim().toUpperCase();
    const name = document.getElementById('inp-inv-name').value.trim();
    const stock = parseInt(document.getElementById('inp-inv-stock').value, 10);
    const leadTime = parseInt(document.getElementById('inp-inv-lead').value, 10);
    const moq = parseInt(document.getElementById('inp-inv-moq').value, 10) || 1;
    const safetyStock = parseInt(document.getElementById('inp-inv-safety').value, 10) || 0;
    if (!id || !name || isNaN(stock) || isNaN(leadTime))
      return showToast('Please fill all fields correctly', 'error');
    const inventory = Store.getInventory();
    const existing = inventory.findIndex(i => i.id === id);
    if (existing >= 0) {
      inventory[existing] = { id, name, stock, leadTime, moq, safetyStock };
      showToast(`Inventory item ${id} updated`, 'success');
    } else {
      inventory.push({ id, name, stock, leadTime, moq, safetyStock });
      showToast(`Inventory item "${name}" added`, 'success');
    }
    Store.setInventory(inventory);
    e.target.reset();
    document.getElementById('inp-inv-moq').value = '1';
    document.getElementById('inp-inv-safety').value = '0';
    renderInventoryTable();
  });
}

function renderInventoryTable() {
  const tbody = document.querySelector('#tbl-inventory tbody');
  const inventory = Store.getInventory();
  if (inventory.length === 0) { tbody.innerHTML = '<tr><td colspan="7" class="empty-msg">No inventory items yet</td></tr>'; return; }
  tbody.innerHTML = inventory.map(i => `
    <tr>
      <td><span class="badge badge-purple">${esc(i.id)}</span></td>
      <td>${esc(i.name)}</td>
      <td>${i.stock}</td>
      <td>${i.leadTime} days</td>
      <td>${i.moq || 1}</td>
      <td>${i.safetyStock || 0}</td>
      <td><button class="btn btn-sm btn-danger-outline" onclick="deleteInventory('${esc(i.id)}')">Delete</button></td>
    </tr>`).join('');
}

function deleteInventory(id) {
  Store.setInventory(Store.getInventory().filter(i => i.id !== id));
  renderInventoryTable();
  showToast('Inventory item removed', 'info');
}

// â”€â”€â”€ DEMAND (MPS) MANAGEMENT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function initDemandForm() {
  document.getElementById('form-demand').addEventListener('submit', (e) => {
    e.preventDefault();
    const productId = document.getElementById('sel-demand-product').value;
    const qty = parseInt(document.getElementById('inp-demand-qty').value, 10);
    const date = document.getElementById('inp-demand-date').value;
    if (!productId || isNaN(qty) || qty <= 0 || !date)
      return showToast('Please fill all fields correctly', 'error');
    const demands = Store.getDemands();
    demands.push({ id: generateId(), productId, qty, date });
    Store.setDemands(demands);
    e.target.reset();
    renderDemandTable();
    showToast('Demand entry added', 'success');
  });
}

function renderDemandTable() {
  const tbody = document.querySelector('#tbl-demand tbody');
  const demands = Store.getDemands();
  const products = Store.getProducts();
  if (demands.length === 0) { tbody.innerHTML = '<tr><td colspan="4" class="empty-msg">No demand entries yet</td></tr>'; return; }
  tbody.innerHTML = demands.map(d => {
    const prod = products.find(p => p.id === d.productId);
    return `<tr>
      <td><span class="badge badge-blue">${esc(d.productId)}</span> ${prod ? esc(prod.name) : ''}</td>
      <td>${d.qty}</td><td>${d.date}</td>
      <td><button class="btn btn-sm btn-danger-outline" onclick="deleteDemand('${esc(d.id)}')">Delete</button></td>
    </tr>`;
  }).join('');
}

function deleteDemand(id) {
  Store.setDemands(Store.getDemands().filter(d => d.id !== id));
  renderDemandTable();
  showToast('Demand entry removed', 'info');
}

// â”€â”€â”€ PRODUCT SELECT DROPDOWNS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function refreshProductSelects() {
  const products = Store.getProducts();
  ['sel-bom-product', 'sel-demand-product'].forEach(selId => {
    const sel = document.getElementById(selId);
    const current = sel.value;
    sel.innerHTML = '<option value="">Select productâ€¦</option>' +
      products.map(p => `<option value="${esc(p.id)}">${esc(p.id)} â€” ${esc(p.name)}</option>`).join('');
    sel.value = current;
  });
}

// â”€â”€â”€ MRP ENGINE (Enhanced) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Multi-level BOM explosion with lot sizing, safety stock, and capacity

function runMrpEngine() {
  const products = Store.getProducts();
  const bom = Store.getBom();
  const inventory = Store.getInventory();
  const demands = Store.getDemands();
  const dailyCapacity = parseInt(document.getElementById('inp-capacity').value, 10) || 100;
  Store.setCapacity(dailyCapacity);

  if (products.length === 0) return showToast('Add products first', 'error');
  if (bom.length === 0) return showToast('Add BOM entries first', 'error');
  if (demands.length === 0) return showToast('Add demand entries first', 'error');

  // Circular dependency check
  function hasCircular(itemId, visited = new Set()) {
    if (visited.has(itemId)) return true;
    visited.add(itemId);
    const children = bom.filter(b => b.productId === itemId);
    for (const child of children) {
      if (hasCircular(child.componentId, new Set(visited))) return true;
    }
    return false;
  }

  for (const entry of bom) {
    if (hasCircular(entry.productId)) {
      return showToast(`Circular BOM dependency detected involving ${entry.productId}!`, 'error');
    }
  }

  // Level-by-level MRP explosion
  const materialResults = [];
  const plannedOrders = [];
  const alerts = [];

  // Level 0: Gross requirements from demands (aggregate by product)
  let currentLevelReqs = {};
  demands.forEach(demand => {
    if (!currentLevelReqs[demand.productId]) {
      currentLevelReqs[demand.productId] = { qty: 0, dates: [] };
    }
    currentLevelReqs[demand.productId].qty += demand.qty;
    currentLevelReqs[demand.productId].dates.push(demand.date);
  });

  let level = 0;
  const MAX_LEVELS = 15;

  while (Object.keys(currentLevelReqs).length > 0 && level < MAX_LEVELS) {
    const nextLevelReqs = {};

    Object.entries(currentLevelReqs).forEach(([itemId, reqData]) => {
      const grossReq = reqData.qty;
      const earliestDate = reqData.dates.sort()[0];
      const invItem = inventory.find(i => i.id === itemId);
      const available = invItem ? invItem.stock : 0;
      const safetyStock = invItem ? (invItem.safetyStock || 0) : 0;
      const moq = invItem ? (invItem.moq || 1) : 1;
      const leadTime = invItem ? invItem.leadTime : 0;
      const itemName = invItem ? invItem.name :
        (products.find(p => p.id === itemId)?.name) ||
        (bom.find(b => b.componentId === itemId)?.componentName) || itemId;

      // Net requirement = max(0, grossReq + safetyStock - available)
      const netReq = Math.max(0, grossReq + safetyStock - available);

      // Lot sizing: round up to MOQ multiples
      let orderQty = 0;
      if (netReq > 0 && moq > 1) {
        orderQty = Math.ceil(netReq / moq) * moq;
      } else {
        orderQty = netReq;
      }

      const status = netReq > 0 ? 'shortage' : 'sufficient';

      materialResults.push({
        level, componentId: itemId, componentName: itemName,
        totalRequired: grossReq, safetyStock, available, netReq, moq, orderQty, status,
      });

      if (netReq > 0) {
        alerts.push(`${itemName} (${itemId}): Need ${netReq} units (Lvl ${level}), only ${available} in stock`);
      }

      // Generate order if needed
      if (orderQty > 0) {
        const hasBomEntries = bom.some(b => b.productId === itemId);
        const orderType = hasBomEntries ? 'Production Order' : 'Purchase Order';
        const orderDate = subtractDays(earliestDate, leadTime);

        plannedOrders.push({
          type: orderType, itemId, itemName, netReq, qty: orderQty,
          requiredDate: earliestDate, orderDate, leadTime,
        });

        // If this item has BOM children, explode to next level
        if (hasBomEntries) {
          const children = bom.filter(b => b.productId === itemId);
          children.forEach(child => {
            const childQty = child.qtyPerUnit * orderQty;
            if (!nextLevelReqs[child.componentId]) {
              nextLevelReqs[child.componentId] = { qty: 0, dates: [] };
            }
            nextLevelReqs[child.componentId].qty += childQty;
            nextLevelReqs[child.componentId].dates.push(earliestDate);
          });
        }
      }
    });

    currentLevelReqs = nextLevelReqs;
    level++;
  }

  if (level >= MAX_LEVELS) {
    showToast('Warning: Maximum BOM depth reached. Check for deep nesting.', 'error');
  }

  // Sort planned orders by order date
  plannedOrders.sort((a, b) => a.orderDate.localeCompare(b.orderDate));

  // Capacity constraint checking
  const capacityAnalysis = analyzeCapacity(plannedOrders, dailyCapacity);

  const result = {
    materialResults, plannedOrders, alerts, capacityAnalysis,
    dailyCapacity, timestamp: new Date().toISOString(),
  };
  Store.setMrpResult(result);

  showToast('MRP Engine completed successfully!', 'success');
  refreshMrpOutput();
  refreshDashboard();
}

// Capacity analysis
function analyzeCapacity(plannedOrders, dailyCapacity) {
  const productionOrders = plannedOrders.filter(o => o.type === 'Production Order');
  const loadByDate = {};

  productionOrders.forEach(o => {
    const date = o.orderDate;
    loadByDate[date] = (loadByDate[date] || 0) + o.qty;
  });

  const overloadedDays = [];
  let maxUtil = 0;

  Object.entries(loadByDate).forEach(([date, load]) => {
    const util = (load / dailyCapacity) * 100;
    if (util > maxUtil) maxUtil = util;
    if (load > dailyCapacity) {
      overloadedDays.push({ date, load, capacity: dailyCapacity, utilization: util });
    }
  });

  return { loadByDate, overloadedDays, maxUtilization: maxUtil, dailyCapacity };
}

// â”€â”€â”€ MRP OUTPUT RENDERING â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function refreshMrpOutput() {
  const result = Store.getMrpResult();
  const emptyEl = document.getElementById('mrp-empty');
  const resultEl = document.getElementById('mrp-results');
  const capInput = document.getElementById('inp-capacity');
  capInput.value = Store.getCapacity();

  if (!result) { emptyEl.style.display = 'flex'; resultEl.style.display = 'none'; return; }
  emptyEl.style.display = 'none';
  resultEl.style.display = 'block';

  // Material Requirements Table
  const matTbody = document.querySelector('#tbl-mrp-materials tbody');
  matTbody.innerHTML = result.materialResults.map(m => {
    const badgeClass = m.status === 'shortage' ? 'badge-danger' : 'badge-success';
    const statusText = m.status === 'shortage' ? 'âš  Shortage' : 'âœ“ Sufficient';
    return `<tr>
      <td><span class="bom-level">${m.level}</span></td>
      <td><span class="badge badge-purple">${esc(m.componentId)}</span></td>
      <td>${esc(m.componentName)}</td>
      <td>${m.totalRequired}</td>
      <td>${m.safetyStock}</td>
      <td>${m.available}</td>
      <td style="font-weight:700; color:${m.netReq > 0 ? 'var(--clr-danger)' : 'var(--clr-success)'}">${m.netReq}</td>
      <td>${m.moq}</td>
      <td style="font-weight:700">${m.orderQty}</td>
      <td><span class="badge ${badgeClass}">${statusText}</span></td>
    </tr>`;
  }).join('');

  // Planned Orders Table
  const ordTbody = document.querySelector('#tbl-mrp-orders tbody');
  ordTbody.innerHTML = result.plannedOrders.map(o => {
    const typeBadge = o.type === 'Purchase Order' ? 'badge-warning' : 'badge-blue';
    const isOverloaded = result.capacityAnalysis?.overloadedDays?.some(d => d.date === o.orderDate && o.type === 'Production Order');
    return `<tr${isOverloaded ? ' style="background:var(--clr-danger-bg)"' : ''}>
      <td><span class="badge ${typeBadge}">${o.type}</span>${isOverloaded ? ' <span class="badge badge-overload">âš¡ Over Capacity</span>' : ''}</td>
      <td><span class="badge badge-purple">${esc(o.itemId)}</span></td>
      <td>${esc(o.itemName)}</td>
      <td>${o.netReq}</td>
      <td style="font-weight:700">${o.qty}${o.qty !== o.netReq ? ' <span style="color:var(--text-muted);font-size:0.78rem">(MOQ)</span>' : ''}</td>
      <td>${o.requiredDate}</td>
      <td style="font-weight:600">${o.orderDate}</td>
      <td>${o.leadTime} days</td>
    </tr>`;
  }).join('');

  // Capacity summary
  renderCapacitySummary(result.capacityAnalysis);

  // Gantt
  renderGanttChart(result.plannedOrders);

  // Charts
  renderNetReqChart(result.materialResults);
  renderOrdersChart(result.plannedOrders);
}

// â”€â”€â”€ CAPACITY SUMMARY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function renderCapacitySummary(analysis) {
  const el = document.getElementById('capacity-summary');
  if (!analysis) { el.innerHTML = ''; return; }
  const avgUtil = Object.values(analysis.loadByDate).length > 0
    ? Object.values(analysis.loadByDate).reduce((s, v) => s + v, 0) / Object.values(analysis.loadByDate).length / analysis.dailyCapacity * 100 : 0;
  const overloads = analysis.overloadedDays.length;
  const avgClass = avgUtil > 90 ? 'danger' : avgUtil > 70 ? 'warn' : 'ok';
  const maxClass = analysis.maxUtilization > 100 ? 'danger' : analysis.maxUtilization > 80 ? 'warn' : 'ok';
  el.innerHTML = `
    <div class="capacity-stat"><span class="capacity-stat-value ${avgClass}">${avgUtil.toFixed(0)}%</span><span class="capacity-stat-label">Avg Util</span></div>
    <div class="capacity-stat"><span class="capacity-stat-value ${maxClass}">${analysis.maxUtilization.toFixed(0)}%</span><span class="capacity-stat-label">Peak Util</span></div>
    <div class="capacity-stat"><span class="capacity-stat-value ${overloads > 0 ? 'danger' : 'ok'}">${overloads}</span><span class="capacity-stat-label">Overloaded Days</span></div>`;
}

// â”€â”€â”€ GANTT CHART â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function renderGanttChart(plannedOrders) {
  const container = document.getElementById('gantt-container');
  if (!container) return;
  if (!plannedOrders || plannedOrders.length === 0) {
    container.innerHTML = '<div class="gantt-empty">Run MRP to see production schedule</div>';
    return;
  }

  const allDates = plannedOrders.flatMap(o => [new Date(o.orderDate), new Date(o.requiredDate)]);
  let minDate = new Date(Math.min(...allDates));
  let maxDate = new Date(Math.max(...allDates));
  minDate.setDate(minDate.getDate() - 1);
  maxDate.setDate(maxDate.getDate() + 2);

  const totalDays = Math.max(1, Math.ceil((maxDate - minDate) / 86400000));
  const todayStr = formatDate(new Date());

  // Date header
  let headerHtml = '';
  for (let d = new Date(minDate); d <= maxDate; d.setDate(d.getDate() + 1)) {
    const ds = formatDate(d);
    const isToday = ds === todayStr;
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    headerHtml += `<div class="gantt-date-col${isToday ? ' today' : ''}${isWeekend ? ' weekend' : ''}">${formatShortDate(d)}</div>`;
  }

  // Rows
  let rowsHtml = '';
  plannedOrders.forEach(order => {
    const startMs = new Date(order.orderDate).getTime();
    const endMs = new Date(order.requiredDate).getTime();
    const startOffset = (startMs - minDate.getTime()) / 86400000;
    const duration = Math.max(1, (endMs - startMs) / 86400000);
    const leftPct = (startOffset / totalDays) * 100;
    const widthPct = (duration / totalDays) * 100;
    const typeClass = order.type === 'Purchase Order' ? 'purchase' : 'production';

    rowsHtml += `<div class="gantt-row">
      <div class="gantt-label">
        <span class="gantt-type-dot ${typeClass}"></span>
        <span class="gantt-item-name">${esc(order.itemName)}</span>
        <span class="gantt-qty">${order.qty}</span>
      </div>
      <div class="gantt-bar-track">
        <div class="gantt-bar ${typeClass}" style="left:${leftPct}%;width:${Math.max(1.5, widthPct)}%;"
             title="${order.type}: ${order.itemName}&#10;Qty: ${order.qty}&#10;${order.orderDate} â†’ ${order.requiredDate}">${order.qty}</div>
      </div>
    </div>`;
  });

  container.innerHTML = `
    <div class="gantt-timeline">
      <div class="gantt-header-dates">${headerHtml}</div>
      <div class="gantt-rows">${rowsHtml}</div>
    </div>
    <div class="gantt-legend">
      <div class="gantt-legend-item"><div class="gantt-legend-color purchase"></div> Purchase Order</div>
      <div class="gantt-legend-item"><div class="gantt-legend-color production"></div> Production Order</div>
    </div>`;
}

function formatShortDate(date) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

// â”€â”€â”€ CSV EXPORT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function downloadCSV(filename, headers, rows) {
  const csvContent = [
    `MRP Report - Generated ${new Date().toLocaleString()}`, '',
    headers.join(','),
    ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
  ].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

function downloadMaterialsCSV() {
  const result = Store.getMrpResult();
  if (!result) return showToast('Run MRP first', 'error');
  const headers = ['Level','Item ID','Item Name','Gross Requirement','Safety Stock','Available Stock','Net Requirement','MOQ','Order Qty','Status'];
  const rows = result.materialResults.map(m => [m.level, m.componentId, m.componentName, m.totalRequired, m.safetyStock, m.available, m.netReq, m.moq, m.orderQty, m.status]);
  downloadCSV('mrp_material_requirements.csv', headers, rows);
  showToast('Material Requirements CSV downloaded', 'success');
}

function downloadOrdersCSV() {
  const result = Store.getMrpResult();
  if (!result) return showToast('Run MRP first', 'error');
  const headers = ['Order Type','Item ID','Item Name','Net Requirement','Order Qty (Lot Sized)','Required Date','Order Date','Lead Time (days)'];
  const rows = result.plannedOrders.map(o => [o.type, o.itemId, o.itemName, o.netReq, o.qty, o.requiredDate, o.orderDate, o.leadTime]);
  downloadCSV('mrp_planned_orders.csv', headers, rows);
  showToast('Planned Orders CSV downloaded', 'success');
}

// â”€â”€â”€ DASHBOARD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function refreshDashboard() {
  document.getElementById('kpi-products').textContent = Store.getProducts().length;
  document.getElementById('kpi-bom').textContent = Store.getBom().length;
  document.getElementById('kpi-inventory').textContent = Store.getInventory().length;
  document.getElementById('kpi-demands').textContent = Store.getDemands().length;

  const result = Store.getMrpResult();
  const alertsContainer = document.getElementById('alerts-container');
  const alertList = document.getElementById('alert-list');

  if (result && result.alerts && result.alerts.length > 0) {
    alertsContainer.style.display = 'block';
    alertList.innerHTML = result.alerts.map(a => `<li>${esc(a)}</li>`).join('');
  } else {
    alertsContainer.style.display = 'none';
  }

  const ordTbody = document.querySelector('#tbl-dashboard-orders tbody');
  if (result && result.plannedOrders && result.plannedOrders.length > 0) {
    const recent = result.plannedOrders.slice(0, 10);
    ordTbody.innerHTML = recent.map(o => {
      const typeBadge = o.type === 'Purchase Order' ? 'badge-warning' : 'badge-blue';
      const isLate = new Date(o.orderDate) < new Date();
      const statusBadge = isLate ? '<span class="badge badge-danger">âš  Overdue</span>' : '<span class="badge badge-success">On Track</span>';
      return `<tr>
        <td><span class="badge ${typeBadge}">${o.type}</span></td>
        <td>${esc(o.itemName)}</td><td>${o.qty}</td><td>${o.orderDate}</td><td>${statusBadge}</td>
      </tr>`;
    }).join('');
  } else {
    ordTbody.innerHTML = '<tr><td colspan="5" class="empty-msg">Run MRP to generate planned orders</td></tr>';
  }
  renderInventoryChart();
  renderRequirementsChart();
}

function refreshMasterData() {
  renderProductsTable(); renderBomTable(); renderInventoryTable(); refreshProductSelects();
}
function refreshDemandTab() { renderDemandTable(); refreshProductSelects(); }

// â”€â”€â”€ CHARTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let chartInstances = {};
function destroyChart(id) { if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; } }
Chart.defaults.color = '#94a3b8';
Chart.defaults.borderColor = 'rgba(148,163,184,0.08)';
Chart.defaults.font.family = "'Inter', system-ui, sans-serif";

function renderInventoryChart() {
  const ctx = document.getElementById('chart-inventory');
  if (!ctx) return;
  destroyChart('inventory');
  const inventory = Store.getInventory();
  if (inventory.length === 0) return;
  chartInstances['inventory'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: inventory.map(i => i.name),
      datasets: [{ data: inventory.map(i => i.stock),
        backgroundColor: ['#3b82f6','#8b5cf6','#14b8a6','#f59e0b','#ef4444','#ec4899','#06b6d4','#84cc16','#f97316','#6366f1'],
        borderWidth: 0, hoverOffset: 6 }],
    },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'right', labels: { padding: 14, usePointStyle: true, pointStyleWidth: 10 } } } },
  });
}

function renderRequirementsChart() {
  const ctx = document.getElementById('chart-requirements');
  if (!ctx) return;
  destroyChart('requirements');
  const result = Store.getMrpResult();
  if (!result || !result.materialResults || result.materialResults.length === 0) return;
  chartInstances['requirements'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: result.materialResults.map(m => m.componentName),
      datasets: [
        { label: 'Required', data: result.materialResults.map(m => m.totalRequired), backgroundColor: 'rgba(239,68,68,0.7)', borderRadius: 4, barPercentage: 0.6 },
        { label: 'Available', data: result.materialResults.map(m => m.available), backgroundColor: 'rgba(34,197,94,0.7)', borderRadius: 4, barPercentage: 0.6 },
        { label: 'Safety Stock', data: result.materialResults.map(m => m.safetyStock), backgroundColor: 'rgba(245,158,11,0.5)', borderRadius: 4, barPercentage: 0.6 },
      ],
    },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { usePointStyle: true, pointStyleWidth: 10 } } },
      scales: { y: { beginAtZero: true, grid: { color: 'rgba(148,163,184,0.06)' } }, x: { grid: { display: false } } } },
  });
}

function renderNetReqChart(materialResults) {
  const ctx = document.getElementById('chart-net-req');
  if (!ctx) return;
  destroyChart('netReq');
  chartInstances['netReq'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: materialResults.map(m => m.componentName),
      datasets: [{ label: 'Net Requirement', data: materialResults.map(m => m.netReq),
        backgroundColor: materialResults.map(m => m.netReq > 0 ? 'rgba(239,68,68,0.8)' : 'rgba(34,197,94,0.8)'),
        borderRadius: 6, barPercentage: 0.5 }],
    },
    options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, grid: { color: 'rgba(148,163,184,0.06)' } }, y: { grid: { display: false } } } },
  });
}

function renderOrdersChart(plannedOrders) {
  const ctx = document.getElementById('chart-orders');
  if (!ctx) return;
  destroyChart('orders');
  const purchaseOrders = plannedOrders.filter(o => o.type === 'Purchase Order');
  const productionOrders = plannedOrders.filter(o => o.type === 'Production Order');
  const allDates = [...new Set(plannedOrders.map(o => o.orderDate))].sort();
  chartInstances['orders'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: allDates,
      datasets: [
        { label: 'Purchase Orders', data: allDates.map(d => purchaseOrders.filter(o => o.orderDate === d).reduce((s, o) => s + o.qty, 0)),
          borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)', fill: true, tension: 0.4, pointRadius: 5, pointHoverRadius: 7 },
        { label: 'Production Orders', data: allDates.map(d => productionOrders.filter(o => o.orderDate === d).reduce((s, o) => s + o.qty, 0)),
          borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', fill: true, tension: 0.4, pointRadius: 5, pointHoverRadius: 7 },
      ],
    },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { usePointStyle: true, pointStyleWidth: 10 } } },
      scales: { y: { beginAtZero: true, grid: { color: 'rgba(148,163,184,0.06)' } }, x: { grid: { display: false } } } },
  });
}

// â”€â”€â”€ SAMPLE DATA (Multi-level BOM) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function loadSampleData() {
  const products = [
    { id: 'PROD-001', name: 'Aluminium Frame Assembly' },
    { id: 'PROD-002', name: 'Steel Bracket Kit' },
    { id: 'PROD-003', name: 'Motor Housing Unit' },
    { id: 'SUB-FRAME-01', name: 'Frame Sub-Assembly' },
  ];

  // Multi-level BOM: PROD-001 â†’ SUB-FRAME-01 â†’ raw materials
  const bom = [
    { productId: 'PROD-001', componentId: 'SUB-FRAME-01', componentName: 'Frame Sub-Assembly', qtyPerUnit: 1 },
    { productId: 'PROD-001', componentId: 'RM-SEAL-01', componentName: 'Rubber Seal Strip', qtyPerUnit: 1 },
    { productId: 'SUB-FRAME-01', componentId: 'RM-ALU-01', componentName: 'Aluminium Sheet', qtyPerUnit: 2 },
    { productId: 'SUB-FRAME-01', componentId: 'RM-RIV-01', componentName: 'Rivets (pack)', qtyPerUnit: 5 },
    { productId: 'PROD-002', componentId: 'RM-STL-01', componentName: 'Steel Plate', qtyPerUnit: 3 },
    { productId: 'PROD-002', componentId: 'RM-BOLT-01', componentName: 'M8 Bolt Set', qtyPerUnit: 8 },
    { productId: 'PROD-002', componentId: 'RM-COAT-01', componentName: 'Zinc Coating Powder', qtyPerUnit: 1 },
    { productId: 'PROD-003', componentId: 'RM-CAST-01', componentName: 'Cast Iron Block', qtyPerUnit: 1 },
    { productId: 'PROD-003', componentId: 'RM-BEAR-01', componentName: 'Ball Bearing (6205)', qtyPerUnit: 4 },
    { productId: 'PROD-003', componentId: 'RM-SEAL-01', componentName: 'Rubber Seal Strip', qtyPerUnit: 2 },
  ];

  const inventory = [
    { id: 'SUB-FRAME-01', name: 'Frame Sub-Assembly', stock: 30, leadTime: 5, moq: 10, safetyStock: 10 },
    { id: 'RM-ALU-01', name: 'Aluminium Sheet', stock: 150, leadTime: 7, moq: 50, safetyStock: 20 },
    { id: 'RM-RIV-01', name: 'Rivets (pack)', stock: 400, leadTime: 3, moq: 100, safetyStock: 50 },
    { id: 'RM-SEAL-01', name: 'Rubber Seal Strip', stock: 50, leadTime: 5, moq: 25, safetyStock: 10 },
    { id: 'RM-STL-01', name: 'Steel Plate', stock: 80, leadTime: 10, moq: 20, safetyStock: 15 },
    { id: 'RM-BOLT-01', name: 'M8 Bolt Set', stock: 200, leadTime: 4, moq: 50, safetyStock: 30 },
    { id: 'RM-COAT-01', name: 'Zinc Coating Powder', stock: 30, leadTime: 14, moq: 10, safetyStock: 5 },
    { id: 'RM-CAST-01', name: 'Cast Iron Block', stock: 20, leadTime: 21, moq: 5, safetyStock: 5 },
    { id: 'RM-BEAR-01', name: 'Ball Bearing (6205)', stock: 100, leadTime: 12, moq: 20, safetyStock: 15 },
  ];

  const today = new Date();
  const demands = [
    { id: generateId(), productId: 'PROD-001', qty: 100, date: formatDate(addDays(today, 30)) },
    { id: generateId(), productId: 'PROD-002', qty: 50, date: formatDate(addDays(today, 25)) },
    { id: generateId(), productId: 'PROD-003', qty: 40, date: formatDate(addDays(today, 35)) },
    { id: generateId(), productId: 'PROD-001', qty: 75, date: formatDate(addDays(today, 45)) },
  ];

  Store.setProducts(products);
  Store.setBom(bom);
  Store.setInventory(inventory);
  Store.setDemands(demands);

  refreshMasterData();
  refreshDemandTab();
  refreshDashboard();

  showToast('Sample data loaded â€” 4 products (incl. sub-assembly), 10 BOM entries, 9 inventory items, 4 demands', 'success');
}

// â”€â”€â”€ UTILITY FUNCTIONS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function esc(str) { const div = document.createElement('div'); div.textContent = str; return div.innerHTML; }
function generateId() { return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5); }
function addDays(date, days) { const r = new Date(date); r.setDate(r.getDate() + days); return r; }
function subtractDays(dateStr, days) { const r = new Date(dateStr); r.setDate(r.getDate() - days); return formatDate(r); }
function formatDate(date) { const d = new Date(date); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

// â”€â”€â”€ INITIALIZATION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initProductForm();
  initBomForm();
  initInventoryForm();
  initDemandForm();

  document.getElementById('btn-run-mrp').addEventListener('click', runMrpEngine);
  document.getElementById('btn-csv-materials').addEventListener('click', downloadMaterialsCSV);
  document.getElementById('btn-csv-orders').addEventListener('click', downloadOrdersCSV);

  document.getElementById('inp-capacity').addEventListener('change', (e) => {
    Store.setCapacity(parseInt(e.target.value, 10) || 100);
  });

  document.getElementById('btn-load-sample').addEventListener('click', () => {
    if (confirm('This will replace all current data with sample data. Continue?')) loadSampleData();
  });

  document.getElementById('btn-clear-all').addEventListener('click', () => {
    if (confirm('This will permanently delete all data. Are you sure?')) {
      Store.clearAll();
      refreshMasterData(); refreshDemandTab(); refreshDashboard(); refreshMrpOutput();
      showToast('All data cleared', 'info');
    }
  });

  refreshMasterData();
  refreshDemandTab();
  refreshDashboard();
  refreshMrpOutput();

  document.getElementById('inp-demand-date').value = formatDate(addDays(new Date(), 14));
  document.getElementById('inp-capacity').value = Store.getCapacity();
});
