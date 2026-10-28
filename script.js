// ============================================================================
// 학교 층별 매핑 데이터 (B4 ~ 10F) - 시설 명칭 제거 버전
// ============================================================================
const FLOORS = [
  { name: '10F', level: 14, zone: '고층' },
  { name: '9F',  level: 13, zone: '고층' },
  { name: '8F',  level: 12, zone: '고층' },
  { name: '7F',  level: 11, zone: '저층' },
  { name: '6F',  level: 10, zone: '저층' },
  { name: '5F',  level: 9,  zone: '저층' },
  { name: '4F',  level: 8,  zone: '저층' },
  { name: '3F',  level: 7,  zone: '저층' },
  { name: '2F',  level: 6,  zone: '저층' },
  { name: '1F',  level: 5,  zone: '공통' },
  { name: 'B1',  level: 4,  zone: '공통' },
  { name: 'B2',  level: 3,  zone: '공통' },
  { name: 'B3',  level: 2,  zone: '공통' },
  { name: 'B4',  level: 1,  zone: '공통' }
];

const SECONDS_PER_FLOOR = 1.0;
const DOOR_STOP_TIME = 2.0;
const MAX_CAPACITY = 15;
const CONGESTION_THRESHOLD = 10;

let passengers = [];
let totalTime = 0;
let totalDistanceFloors = 0;
let timerInterval = null;
let isSimulating = false;

let elevators = [
  { id: 1, level: 5, dir: 0, passengers: [], isMoving: false, isStopping: false, el: null, floorTxt: null, stateTxt: null, box: null },
  { id: 2, level: 5, dir: 0, passengers: [], isMoving: false, isStopping: false, el: null, floorTxt: null, stateTxt: null, box: null }
];

function initUI() {
  const startSelect = document.getElementById('startFloor');
  const destSelect = document.getElementById('destFloor');
  
  FLOORS.forEach(f => {
    startSelect.add(new Option(f.name, f.level));
    destSelect.add(new Option(f.name, f.level));
  });
  
  startSelect.value = 5;  // 1F
  destSelect.value = 14; // 10F

  const building = document.getElementById('building');
  const shafts = building.querySelector('.shafts-container');

  FLOORS.forEach(f => {
    const floorDiv = document.createElement('div');
    floorDiv.className = `floor ${f.level <= 4 ? 'basement' : ''}`;
    floorDiv.innerHTML = `
      <div class="floor-info">
        <span class="floor-label">${f.name}</span>
      </div>
      <div class="floor-waiting" id="waiting-level-${f.level}"></div>
    `;
    building.insertBefore(floorDiv, shafts);
  });

  elevators[0].el = document.getElementById('el1');
  elevators[0].floorTxt = document.getElementById('el1Floor');
  elevators[0].stateTxt = document.getElementById('el1State');
  elevators[0].box = document.getElementById('el1Box');

  elevators[1].el = document.getElementById('el2');
  elevators[1].floorTxt = document.getElementById('el2Floor');
  elevators[1].stateTxt = document.getElementById('el2State');
  elevators[1].box = document.getElementById('el2Box');
}

function addPassengerGroup(startLvl = null, destLvl = null, pCount = null) {
  const startLevel = startLvl || parseInt(document.getElementById('startFloor').value);
  const destLevel = destLvl || parseInt(document.getElementById('destFloor').value);
  const count = pCount || parseInt(document.getElementById('passengerCount').value);

  if (startLevel === destLevel) return;

  const destObj = FLOORS.find(f => f.level === destLevel);
  const dir = destLevel > startLevel ? 1 : -1;

  for (let i = 0; i < count; i++) {
    const p = {
      id: 'p_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      startLevel,
      destLevel,
      destName: destObj.name,
      dir,
      status: 'WAITING',
      assignedEl: null,
      domEl: null
    };
    passengers.push(p);
    renderPassengerDot(p);
  }

  optimizeSystemDispatch();
  updateMetrics();
}

function generateCongestion() {
  addPassengerGroup(5, 14, 4);
  addPassengerGroup(5, 12, 3);
  addPassengerGroup(5, 8, 4);
  addPassengerGroup(5, 6, 3);
  
  startSimulation();
}

function renderPassengerDot(p) {
  const container = document.getElementById(`waiting-level-${p.startLevel}`);
  const dot = document.createElement('div');
  dot.className = `p-dot`;
  dot.id = p.id;
  dot.innerText = p.destName.replace('F','').replace('B','');
  container.appendChild(dot);
  p.domEl = dot;
}

function updateMetrics() {
  const activeCount = passengers.filter(p => p.status !== 'COMPLETED').length;
  document.getElementById('activeCount').innerText = `${activeCount}명`;
  document.getElementById('totalDistance').innerText = `${totalDistanceFloors}층`;
  
  const statusBadge = document.getElementById('systemStatus');
  if (activeCount >= CONGESTION_THRESHOLD) {
    statusBadge.className = 'status-badge status-congested';
    statusBadge.innerText = '상태: 혼잡 (동적 Zoning 모드)';
  } else {
    statusBadge.className = 'status-badge status-normal';
    statusBadge.innerText = '상태: 일반 모드';
  }
  
  passengers.forEach(p => {
    if (p.domEl && p.status === 'WAITING') {
      p.domEl.classList.remove('el1-assigned', 'el2-assigned');
      if (p.assignedEl === 1) p.domEl.classList.add('el1-assigned');
      if (p.assignedEl === 2) p.domEl.classList.add('el2-assigned');
    }
  });
}

function optimizeSystemDispatch() {
  const activeCount = passengers.filter(p => p.status !== 'COMPLETED').length;
  const isCongested = activeCount >= CONGESTION_THRESHOLD;

  const waitingPassengers = passengers.filter(p => p.status === 'WAITING');

  waitingPassengers.forEach(p => {
    const cost1 = evaluateCostFunction(elevators[0], p, isCongested);
    const cost2 = evaluateCostFunction(elevators[1], p, isCongested);

    p.assignedEl = (cost1 <= cost2) ? 1 : 2;
  });

  updateMetrics();
}

function evaluateCostFunction(ev, p, isCongested) {
  let cost = 0;

  if (isCongested) {
    const isHighFloorDest = p.destLevel >= 12;
    const isHighFloorStart = p.startLevel >= 12;
    
    if (ev.id === 1 && (isHighFloorDest || isHighFloorStart)) cost += 5000;
    if (ev.id === 2 && ((!isHighFloorDest && p.destLevel > 5) || (!isHighFloorStart && p.startLevel > 5))) cost += 5000;
  }

  let distanceToStart = Math.abs(ev.level - p.startLevel);
  cost += distanceToStart * SECONDS_PER_FLOOR;

  const plannedStops = new Set();
  ev.passengers.forEach(req => plannedStops.add(req.destLevel));
  passengers.filter(req => req.status === 'WAITING' && req.assignedEl === ev.id).forEach(req => plannedStops.add(req.startLevel));
  
  if (!plannedStops.has(p.startLevel)) cost += DOOR_STOP_TIME * ev.passengers.length * 1.5;
  if (!plannedStops.has(p.destLevel)) cost += DOOR_STOP_TIME * (ev.passengers.length + 1) * 1.5;

  if (plannedStops.has(p.destLevel)) cost -= 15;

  if (ev.dir !== 0 && ((ev.dir === 1 && p.startLevel < ev.level) || (ev.dir === -1 && p.startLevel > ev.level))) {
    cost += 80; 
  }

  const assignedCount = passengers.filter(req => req.status === 'WAITING' && req.assignedEl === ev.id).length;
  if (ev.passengers.length + assignedCount >= MAX_CAPACITY) cost += 10000;

  if (ev.passengers.length === 0) cost -= 10;

  return cost;
}

function startSimulation() {
  if (isSimulating || passengers.filter(p => p.status !== 'COMPLETED').length === 0) return;
  isSimulating = true;

  timerInterval = setInterval(() => {
    totalTime += 0.5;
    document.getElementById('totalTime').innerText = `${totalTime.toFixed(1)}초`;
    runElevatorLoop();
  }, 500);
}

function runElevatorLoop() {
  const hasEmptyElevator = elevators.some(ev => ev.passengers.length === 0);
  if (hasEmptyElevator) {
    optimizeSystemDispatch();
  }

  const activePassengers = passengers.filter(p => p.status !== 'COMPLETED');
  if (activePassengers.length === 0) {
    clearInterval(timerInterval);
    isSimulating = false;
    return;
  }

  elevators.forEach(ev => {
    if (ev.isMoving || ev.isStopping) return;

    const canDisembark = ev.passengers.some(p => p.destLevel === ev.level);
    const waitingHere = passengers.filter(p => 
      p.status === 'WAITING' && 
      p.startLevel === ev.level && 
      p.assignedEl === ev.id &&
      (ev.dir === 0 || p.dir === ev.dir)
    );

    if (canDisembark || (waitingHere.length > 0 && ev.passengers.length < MAX_CAPACITY)) {
      stopAndProcess(ev);
      return;
    }

    let nextTarget = findNextTargetLevel(ev);
    if (nextTarget !== null && nextTarget !== ev.level) {
      moveToLevel(ev, nextTarget);
    } else {
      ev.dir = 0;
    }
  });
}

function stopAndProcess(ev) {
  ev.isStopping = true;
  ev.stateTxt.innerText = `승하차`;

  setTimeout(() => {
    const exiting = ev.passengers.filter(p => p.destLevel === ev.level);
    exiting.forEach(p => {
      p.status = 'COMPLETED';
      if (p.domEl) p.domEl.remove();
    });
    ev.passengers = ev.passengers.filter(p => p.destLevel !== ev.level);

    let availableSpace = MAX_CAPACITY - ev.passengers.length;
    let candidates = passengers.filter(p => p.status === 'WAITING' && p.startLevel === ev.level && p.assignedEl === ev.id);

    if (ev.passengers.length > 0) {
      candidates = candidates.filter(p => p.dir === ev.dir);
    } else if (candidates.length > 0) {
      ev.dir = candidates[0].dir;
      candidates = candidates.filter(p => p.dir === ev.dir);
    }

    const boarding = candidates.slice(0, availableSpace);
    boarding.forEach(p => {
      p.status = 'ONBOARD';
      ev.passengers.push(p);

      if (p.domEl) {
        p.domEl.classList.add('in-car');
        ev.box.appendChild(p.domEl);
      }
    });

    if (ev.passengers.length === 0 && passengers.filter(p => p.status === 'WAITING' && p.assignedEl === ev.id).length === 0) {
      ev.dir = 0;
    }
    
    updateMetrics();

    setTimeout(() => {
      ev.isStopping = false;
      ev.stateTxt.innerText = ev.dir === 1 ? '▲ 상행' : (ev.dir === -1 ? '▼ 하행' : '대기');
    }, 300);

  }, DOOR_STOP_TIME * 1000);
}

function moveToLevel(ev, targetLevel) {
  ev.isMoving = true;
  const distance = Math.abs(targetLevel - ev.level);
  const moveTimeSec = distance * SECONDS_PER_FLOOR;

  totalDistanceFloors += distance;
  ev.dir = targetLevel > ev.level ? 1 : -1;
  ev.stateTxt.innerText = `${ev.dir > 0 ? '▲' : '▼'} 이동중`;

  ev.el.style.transitionDuration = `${moveTimeSec}s`;
  ev.el.style.bottom = `${((targetLevel - 1) / 14) * 100}%`;

  setTimeout(() => {
    ev.level = targetLevel;
    const currentFloorObj = FLOORS.find(f => f.level === targetLevel);
    ev.floorTxt.innerText = currentFloorObj.name;
    ev.isMoving = false;
    ev.stateTxt.innerText = '대기';
    updateMetrics();
  }, moveTimeSec * 1000);
}

function findNextTargetLevel(ev) {
  let targets = [];
  ev.passengers.forEach(p => targets.push(p.destLevel));
  passengers.filter(p => p.status === 'WAITING' && p.assignedEl === ev.id)
            .forEach(p => targets.push(p.startLevel));

  if (targets.length === 0) return null;

  if (ev.dir === 1) {
    let above = targets.filter(l => l > ev.level);
    return above.length > 0 ? Math.min(...above) : Math.max(...targets);
  } else if (ev.dir === -1) {
    let below = targets.filter(l => l < ev.level);
    return below.length > 0 ? Math.max(...below) : Math.min(...targets);
  } else {
    return targets.reduce((prev, curr) => Math.abs(curr - ev.level) < Math.abs(prev - ev.level) ? curr : prev);
  }
}

function resetSimulator() {
  clearInterval(timerInterval);
  isSimulating = false;
  passengers = [];
  totalTime = 0;
  totalDistanceFloors = 0;

  document.getElementById('totalTime').innerText = '0.0초';
  document.getElementById('totalDistance').innerText = '0층';
  updateMetrics();

  FLOORS.forEach(f => {
    document.getElementById(`waiting-level-${f.level}`).innerHTML = '';
  });

  elevators.forEach(ev => {
    ev.level = 5;
    ev.dir = 0;
    ev.passengers = [];
    ev.isMoving = false;
    ev.isStopping = false;
    ev.box.innerHTML = '';
    ev.el.style.transitionDuration = '0.5s';
    ev.el.style.bottom = `${((5 - 1) / 14) * 100}%`;
    ev.floorTxt.innerText = '1F';
    ev.stateTxt.innerText = '대기';
  });
}

initUI();