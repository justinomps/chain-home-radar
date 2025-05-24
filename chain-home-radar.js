// Chain Home Radar Component
const ChainHomeStation = () => {
  const [isPowered, setIsPowered] = React.useState(true);
  const [isTraceVisible, setIsTraceVisible] = React.useState(true);
  const [showAnalysis, setShowAnalysis] = React.useState(false);
  const [goniometerAngle, setGoniometerAngle] = React.useState(160);
  const [targets, setTargets] = React.useState([]);
  const [sweepPosition, setSweepPosition] = React.useState(0);
  const [previousTraces, setPreviousTraces] = React.useState([]); // Keep for now, but disable usage

  // Constants
  const RADAR_RANGE = 150;
  const MIN_ALTITUDE = 1000;
  const MAX_ALTITUDE = 30000;
  const SWEEP_WIDTH = 1200;
  const SCOPE_HEIGHT = 300;
  const PLAN_VIEW_SIZE = 400;
  const PHOSPHOR_PERSISTENCE = 20;
  const MAX_PREVIOUS_TRACES = 3;
  const KM_TO_MILES = 0.621371;

  const canvasRef = React.useRef(null);
  const planViewRef = React.useRef(null);

  // Function to calculate max detection range based on altitude
  const getMaxRangeForAltitude = (altitude) => {
    const altitudeFt = Math.max(altitude, MIN_ALTITUDE);
    const normalizedAlt = Math.min(altitudeFt / MAX_ALTITUDE, 1);
    return RADAR_RANGE * (0.4 + 0.6 * normalizedAlt);
  };

  const AIRCRAFT_TYPES = [
    { type: "He 111", minSpeed: 230, maxSpeed: 255, minAlt: 13000, maxAlt: 22000, isEscort: false },
    { type: "Do 17", minSpeed: 240, maxSpeed: 265, minAlt: 15000, maxAlt: 23000, isEscort: false },
    { type: "Ju 88", minSpeed: 250, maxSpeed: 280, minAlt: 15000, maxAlt: 26000, isEscort: false },
    { type: "Bf 109", minSpeed: 290, maxSpeed: 350, minAlt: 18000, maxAlt: 32000, isEscort: true },
    { type: "Bf 110", minSpeed: 270, maxSpeed: 330, minAlt: 16000, maxAlt: 29000, isEscort: true }
  ];

  // Create a target at a given range and bearing
  const createTarget = (range, bearing) => {
    const bearingRad = (bearing * Math.PI) / 180;
    const isEscortMission = Math.random() < 0.3;
    const possibleTypes = AIRCRAFT_TYPES.filter(a => a.isEscort === isEscortMission);
    const aircraft = possibleTypes[Math.floor(Math.random() * possibleTypes.length)];
    const speed = aircraft.minSpeed + Math.random() * (aircraft.maxSpeed - aircraft.minSpeed);
    const altitude = aircraft.minAlt + Math.random() * (aircraft.maxAlt - aircraft.minAlt);
    return {
      id: Math.floor(Math.random() * 900) + 100,
      x: range * Math.cos(bearingRad),
      y: range * Math.sin(bearingRad),
      bearing: bearing,
      speed: speed / 3600,
      altitude: altitude,
      aircraftType: aircraft.type,
      size: 20 + Math.random() * 5,
      count: isEscortMission ? (1 + Math.floor(Math.random() * 2)) : (3 + Math.floor(Math.random() * 8))
    };
  };

  // Handle power state changes with sweep effect
  React.useEffect(() => {
    if (isPowered) {
      const numTargets = 1 + Math.floor(Math.random() * 5);
      const newTargets = [];
      for (let i = 0; i < numTargets; i++) {
        const range = Math.sqrt(Math.random()) * RADAR_RANGE;
        const bearing = 110 + Math.random() * 100;
        newTargets.push(createTarget(range, bearing));
      }
      setTargets(newTargets);
      setSweepPosition(0);
      const sweepDuration = 2000;
      const startTime = Date.now();
      const sweepInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / sweepDuration, 1);
        setSweepPosition(SWEEP_WIDTH * progress);
        if (progress >= 1) {
          clearInterval(sweepInterval);
          setIsTraceVisible(true);
        }
      }, 16);
      return () => clearInterval(sweepInterval);
    } else {
      setIsTraceVisible(false);
      setSweepPosition(0);
      setTargets([]);
    }
  }, [isPowered]);

  // Initialize and move targets
  React.useEffect(() => {
    if (!isPowered) return;
    const UPDATE_RATE = 0.1;
    const moveInterval = setInterval(() => {
      setTargets(currentTargets => {
        let newTargets = currentTargets
          .map(target => {
            const range = Math.sqrt(target.x ** 2 + target.y ** 2);
            if (range < 5) return null;
            const bearingRad = (target.bearing * Math.PI) / 180;
            const distanceThisUpdate = target.speed * UPDATE_RATE;
            const newRange = range - distanceThisUpdate;
            return {
              ...target,
              x: newRange * Math.cos(bearingRad),
              y: newRange * Math.sin(bearingRad)
            };
          })
          .filter(Boolean);
        if (newTargets.length < 2) {
          const range = Math.sqrt(Math.random()) * RADAR_RANGE;
          const bearing = 110 + Math.random() * 100;
          newTargets.push(createTarget(range, bearing));
        }
        return newTargets;
      });
    }, UPDATE_RATE * 1000);
    return () => clearInterval(moveInterval);
  }, [isPowered]);

  const getSignalStrength = (target) => {
    const range = Math.sqrt(target.x ** 2 + target.y ** 2);
    const bearing = ((Math.atan2(target.y, target.x) * 180) / Math.PI + 360) % 360;
    const angleDiff = Math.abs(bearing - goniometerAngle);
    const normalizedDiff = angleDiff > 180 ? 360 - angleDiff : angleDiff;
    // CHANGED: Increased power (to 8) for stronger directional effect
    const directionFactor = Math.pow(Math.cos((normalizedDiff * Math.PI) / 180), 8); 
    const maxRange = getMaxRangeForAltitude(target.altitude);
    const rangeFactor = Math.max(0, 1 - (range / maxRange));
    // CHANGED: Increased base strength (to 3.0) for larger blips
    return directionFactor * rangeFactor * 3.0 * (target.count / 4); // Added target.count factor
  };

  // ##################################################################
  // #                  START OF A-SCOPE DRAWING CHANGES                #
  // ##################################################################

  const drawTrace = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, SWEEP_WIDTH, SCOPE_HEIGHT);

    ctx.strokeStyle = '#1F3F3F'; // Dark green for markers
    ctx.lineWidth = 1;
    ctx.fillStyle = '#00FF00'; // Bright green for text
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';

    // Draw range markers (Move text to bottom)
    for (let range = 0; range <= RADAR_RANGE; range += 20) {
      const x = (range / RADAR_RANGE) * SWEEP_WIDTH;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, SCOPE_HEIGHT);
      ctx.stroke();
      // CHANGED: Text at the bottom now
      ctx.fillText(`${range}`, x, SCOPE_HEIGHT - 5); 
    }
    ctx.textAlign = 'left';
    ctx.fillText('mi', SWEEP_WIDTH - 25, SCOPE_HEIGHT - 5);

    if (!isPowered || !isTraceVisible) return;

    // --- NEW: A-Scope Drawing Logic ---
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.9)'; // Bright green for trace
    ctx.lineWidth = 1.5; // Make the trace line slightly thicker

    // CHANGED: Baseline near the top (30% down from top)
    const baseline = SCOPE_HEIGHT * 0.3; 
    const GRASS_HEIGHT = 5; // NEW: Max height of grass spikes
    const BLIP_WIDTH = 3;   // NEW: How many 'x' pixels a blip can cover

    // Draw the baseline itself (optional, but adds clarity)
    ctx.beginPath();
    ctx.moveTo(0, baseline);
    ctx.lineTo(sweepPosition, baseline);
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)'; // Fainter baseline
    ctx.stroke();
    
    // Set style for grass and blips
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.9)'; // Bright green
    ctx.lineWidth = 1.5; // Thicker line for spikes

    // We draw individual vertical spikes now
    for (let x = 0; x < sweepPosition; x++) {
      const range = (x / SWEEP_WIDTH) * RADAR_RANGE;
      let maxSignal = 0;

      targets.forEach(target => {
        const targetRange = Math.sqrt(target.x ** 2 + target.y ** 2);
        const rangeDiff = Math.abs(targetRange - range);

        if (rangeDiff < BLIP_WIDTH / 2) {
          const peakFactor = 1 - (rangeDiff / (BLIP_WIDTH / 2));
          const signal = getSignalStrength(target) * peakFactor;
          if (signal > maxSignal) {
            maxSignal = signal;
          }
        }
      });

      // CHANGED: Draw downwards. Start with grass height.
      let y_bottom = baseline + Math.random() * GRASS_HEIGHT; 

      if (maxSignal > 0) {
        // CHANGED: Calculate peak height downwards
        const peakHeight = maxSignal * SCOPE_HEIGHT * 0.6; // 60% of scope height potential
        y_bottom = baseline + peakHeight;
      }
      
      // Ensure it doesn't go off-screen
      y_bottom = Math.min(y_bottom, SCOPE_HEIGHT -1); // -1 to keep it visible

      // Draw the vertical spike (grass or blip)
      ctx.beginPath();
      ctx.moveTo(x, baseline);
      ctx.lineTo(x, y_bottom);
      ctx.stroke();
    }
    
    // --- Temporarily disable previous traces ---
    // We will re-implement persistence later in a more realistic way.
  };

  // ##################################################################
  // #                   END OF A-SCOPE DRAWING CHANGES                 #
  // ##################################################################

  const drawPlanView = () => {
    // ... (This function remains unchanged) ...
    const canvas = planViewRef.current;
    if (!canvas || !isPowered) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, PLAN_VIEW_SIZE, PLAN_VIEW_SIZE);
    ctx.save();
    ctx.translate(PLAN_VIEW_SIZE/2, PLAN_VIEW_SIZE/2);
    ctx.strokeStyle = '#666666';
    ctx.lineWidth = 1;
    for (let range = 20; range <= RADAR_RANGE; range += 20) {
      const radius = (range / RADAR_RANGE) * (PLAN_VIEW_SIZE/2);
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#333333';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(range.toString(), 0, radius +1);
    }
    ctx.fillStyle = '#333333';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('N', 0, -PLAN_VIEW_SIZE/2 + 20);
    ctx.fillText('S', 0, PLAN_VIEW_SIZE/2 - 10);
    ctx.fillText('E', PLAN_VIEW_SIZE/2 - 10, 0);
    ctx.fillText('W', -PLAN_VIEW_SIZE/2 + 10, 0);
    ctx.fillStyle = '#00FF00';
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 1;
    const minAngleRad = (110 * Math.PI / 180) - Math.PI/2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(minAngleRad) * (PLAN_VIEW_SIZE/2), Math.sin(minAngleRad) * (PLAN_VIEW_SIZE/2));
    ctx.stroke();
    const maxAngleRad = (210 * Math.PI / 180) - Math.PI/2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(maxAngleRad) * (PLAN_VIEW_SIZE/2), Math.sin(maxAngleRad) * (PLAN_VIEW_SIZE/2));
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, PLAN_VIEW_SIZE/2, minAngleRad, maxAngleRad);
    ctx.stroke();
    const angleRad = (goniometerAngle * Math.PI / 180) - Math.PI/2;
    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(angleRad) * (PLAN_VIEW_SIZE/2), Math.sin(angleRad) * (PLAN_VIEW_SIZE/2));
    ctx.stroke();
    ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    const spread = 15 * Math.PI / 180;
    ctx.arc(0, 0, PLAN_VIEW_SIZE/2, angleRad - spread, angleRad + spread);
    ctx.lineTo(0, 0);
    ctx.fill();
    targets.forEach(target => {
      const rotatedX = (target.y / RADAR_RANGE) * (PLAN_VIEW_SIZE/2);
      const rotatedY = (-target.x / RADAR_RANGE) * (PLAN_VIEW_SIZE/2);
      const range = Math.sqrt(target.x ** 2 + target.y ** 2);
      const maxRange = getMaxRangeForAltitude(target.altitude);
      const isInRange = range <= maxRange;
      ctx.fillStyle = isInRange ? '#22c55e' : '#ef4444';
      ctx.beginPath();
      ctx.arc(rotatedX, rotatedY, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = isInRange ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(rotatedX, rotatedY);
      const trailLength = 20;
      const bearingRad = (target.bearing * Math.PI / 180) - Math.PI/2;
      ctx.lineTo(rotatedX + Math.cos(bearingRad) * trailLength, rotatedY + Math.sin(bearingRad) * trailLength);
      ctx.stroke();
    });
    ctx.restore();
  };

  React.useEffect(() => {
    // CHANGED: Added `isTraceVisible` back in, ensure it redraws when trace appears
    const animationFrame = requestAnimationFrame(drawTrace);
    return () => cancelAnimationFrame(animationFrame);
  }, [targets, goniometerAngle, isPowered, isTraceVisible, sweepPosition]); // Updated dependencies

  React.useEffect(() => {
    const animationFrame = requestAnimationFrame(drawPlanView);
    return () => cancelAnimationFrame(animationFrame);
  }, [targets, goniometerAngle, isPowered]);

  return (
    // ... (The JSX remains unchanged) ...
    <div className="ch-w-full ch-max-w-7xl ch-p-4">
      <div className="ch-bg-gray-800 ch-rounded-lg ch-p-6">
        <div className="ch-flex ch-justify-between ch-items-center ch-mb-4">
          <h2 className="ch-text-2xl ch-font-bold ch-text-green-500">
            Chain Home RDF Station
          </h2>
          <div className="ch-flex ch-items-center">
            <span className="ch-text-green-500 ch-mr-2 ch-text-lg">Power:</span>
            <label className="ch-relative ch-inline-flex ch-items-center ch-cursor-pointer">
              <input
                type="checkbox"
                className="ch-sr-only ch-peer"
                checked={isPowered}
                onChange={(e) => setIsPowered(e.target.checked)}
              />
              <div className="ch-w-14 ch-h-7 ch-bg-gray-700 ch-peer-focus:outline-none ch-peer-focus:ring-4 ch-peer-focus:ring-green-800 ch-rounded-full ch-peer ch-peer-checked:after:translate-x-full ch-peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-300 after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all ch-peer-checked:bg-green-600"></div>
            </label>
          </div>
        </div>
        <div className="ch-bg-black ch-p-6 ch-rounded-lg">
          <canvas
            ref={canvasRef}
            width={SWEEP_WIDTH}
            height={SCOPE_HEIGHT}
            className="ch-w-full ch-bg-black"
          />
        </div>
        <div className="ch-mt-6 ch-grid ch-grid-cols-2 ch-gap-6">
          <div className="ch-flex ch-items-center">
            <span className="ch-text-green-500 ch-mr-2 ch-text-lg">
              Goniometer Angle:
            </span>
            <input
              type="range"
              min="110"
              max="210"
              value={goniometerAngle}
              onChange={(e) => setGoniometerAngle(Number(e.target.value))}
              className="ch-flex-grow ch-h-2"
              disabled={!isPowered}
            />
            <span className="ch-text-green-500 ch-ml-2 ch-text-lg">
              {goniometerAngle}°
            </span>
          </div>
          <div className="ch-flex ch-items-center ch-justify-end">
            <span className="ch-text-green-500 ch-mr-2 ch-text-lg">Show what the RDF is seeing:</span>
            <label className="ch-relative ch-inline-flex ch-items-center ch-cursor-pointer">
              <input
                type="checkbox"
                className="ch-sr-only ch-peer"
                checked={showAnalysis}
                onChange={(e) => setShowAnalysis(e.target.checked)}
                disabled={!isPowered}
              />
              <div className="ch-w-14 ch-h-7 ch-bg-gray-700 ch-peer-focus:outline-none ch-peer-focus:ring-4 ch-peer-focus:ring-green-800 ch-rounded-full ch-peer ch-peer-checked:after:translate-x-full ch-peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-300 after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all ch-peer-checked:bg-green-600"></div>
            </label>
          </div>
        </div>
        <div
          className={`ch-mt-4 ch-p-4 ch-bg-white ch-rounded ch-text-black ch-transition-all ch-duration-1000 ${
            showAnalysis ? 'ch-max-h-screen' : 'ch-max-h-0 ch-overflow-hidden'
          }`}
        >
          <h4 className="ch-font-bold ch-mb-2 ch-text-black">
            What the RDF Station is Seeing: Range/Bearing Analysis
          </h4>
          <div className="ch-flex ch-gap-4">
            <div className="ch-relative">
              <canvas
                ref={planViewRef}
                width={PLAN_VIEW_SIZE}
                height={PLAN_VIEW_SIZE}
                className="ch-bg-white ch-rounded-lg ch-border ch-border-gray-300"
              />
              <div className="ch-absolute ch-top-2 ch-right-2 ch-bg-white/90 ch-p-1.5 ch-rounded ch-border ch-border-gray-300 ch-text-xs">
                <div className="ch-font-bold ch-mb-0.5">Target Status</div>
                <div className="ch-flex ch-items-center ch-gap-1">
                  <div className="ch-w-2 ch-h-2 ch-rounded-full ch-bg-green-500"></div>
                  <span>In Range</span>
                </div>
                <div className="ch-flex ch-items-center ch-gap-1">
                  <div className="ch-w-2 ch-h-2 ch-rounded-full ch-bg-red-500"></div>
                  <span>Out of Range (Distance/Altitude)</span>
                </div>
              </div>
            </div>
            <div className="ch-flex-1">
              <div className="ch-grid ch-grid-cols-6 ch-gap-2 ch-text-sm ch-mb-1 ch-border-b ch-border-gray-300">
                <div>Raid Number</div>
                <div>Range (mi)</div>
                <div>Bearing (°)</div>
                <div>Alt (ft)</div>
                <div>Speed (mph)</div>
                <div>Count</div>
              </div>
              {targets.map((target, index) => {
                const range = Math.sqrt(target.x ** 2 + target.y ** 2);
                const bearing = ((Math.atan2(target.y, target.x) * 180) / Math.PI + 360) % 360;
                const speedMph = target.speed * 3600;
                return (
                  <div
                    key={index}
                    className="ch-grid ch-grid-cols-6 ch-gap-2 ch-text-sm ch-hover:bg-gray-100"
                  >
                    <div>{target.id} ({target.aircraftType})</div>
                    <div>{range.toFixed(1)}</div>
                    <div>{bearing.toFixed(1)}°</div>
                    <div>{Math.round(target.altitude).toLocaleString()}</div>
                    <div>{speedMph.toFixed(0)}</div>
                    <div>× {target.count}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Mount the component
// Make sure you have a div with id="chain-home-radar" in your HTML.
// const root = ReactDOM.createRoot(document.getElementById('chain-home-radar'));
// root.render(React.createElement(ChainHomeStation));
