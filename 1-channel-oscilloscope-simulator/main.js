// Settings
const numberOfDivisions = 6;

// Colours
const traceGreen = "#00e021";
const faintTraceGreen = "rgba(0, 224, 33, 0.5)";

// Global access variables
let scopeCanvas, scopeCanvasCtx;
let inputSignalFrequencyInput, inputSignalAmplitudeInput, inputSignalDCOffsetInput;
let timebaseSelect, xOffsetInput, ySensitivitySelect, yOffsetInput, couplingModeSelect, triggerLevelInput, triggerModeSelect;

// Triggering
let triggered = false;
let triggerYPosition = 0;

// Trace drawing timing
let dotDrawDelayTimeout = () => {};

// Show input signal controls
let showInputSignalControls = true; // Default to show controls

const randomiseInputs = (settings) => {
	// Iterates an array of DOM input elements and randomises their values
	for(let settingIndex = 0; settingIndex < settings.length; settingIndex++) {
		const setting = settings[settingIndex];
		if(setting.type == "number") {
			// If setting is a number input, set setting value to random number within range specified in DOM
			const min = Number(setting.min);
			const max = Number(setting.max);
			const step = Number(setting.step || 1);

			// Step allows decimal values to be randomly generated
			setting.value = randomInt(min / step, max / step) * step;
		} else  {
			// If setting is a select dropdown, set to random option child
			const options = setting.getElementsByTagName('option');
			options[Math.floor(Math.random() * options.length)].selected = true;
		}
	}

	// Refresh oscilloscope display to reflect changes
	refreshDisplay();
}

const refreshDisplay = () => {
	// Clear all timeouts
	killSleep();

	// Clear display
	scopeCanvasCtx.clearRect(0, 0, scopeCanvas.width, scopeCanvas.height);

	// Assume scope is not triggered
	triggered = false;
	
	// Get input signal parameters
	const signalPeriod = 1 / Number(inputSignalFrequencyInput.value);
	const signalAmplitude = Number(inputSignalAmplitudeInput.value);
	const signalDCOffset = Number(inputSignalDCOffsetInput.value);

	// Get current scope settings
	const timebase = Number(timebaseSelect.value);
	const xOffset = Number(xOffsetInput.value);
	const ySensitivity = Number(ySensitivitySelect.value);
	const yOffset = Number(yOffsetInput.value);
	const couplingMode = couplingModeSelect.value;
	const triggerLevel = Number(triggerLevelInput.value);

	// Scale input signal by scope settings
	const period = timebase / (signalPeriod / numberOfDivisions);
	let amplitude = signalAmplitude / (ySensitivity * numberOfDivisions);
	
	// If ground coupling mode, amplitude is fixed to 0 (a straight line)
	if(couplingMode == "gnd") {
		amplitude = 0;
	}

	// Scale vertical offset
	let verticalOffset = ((yOffset / numberOfDivisions) * 2)

	// If DC coupling mode, modify vertical offset accordingly
	if(couplingMode == "dc") {
		verticalOffset += (signalDCOffset / (ySensitivity * numberOfDivisions) * 2);
	}
	
	// Scale horizontal offset
	const horizontalOffset = (xOffset / numberOfDivisions) * 360;

	drawGraticule();
	drawTriggerLevel(triggerLevel);
	drawSignalTrace(amplitude, period, 0, verticalOffset, horizontalOffset);
	
}

const drawGraticule = () => {
	// Draw major divisions
	scopeCanvasCtx.strokeStyle = "white";
	scopeCanvasCtx.lineWidth = 1;
	
	for(let i = 0; i < 1; i += (1/numberOfDivisions)) {
		const linePos = Math.abs((360 * i) - 1);
	    	
		// Draw vertical grid lines
		scopeCanvasCtx.beginPath();
	    	scopeCanvasCtx.moveTo(linePos, 0);
	    	scopeCanvasCtx.lineTo(linePos, 360);
	    	scopeCanvasCtx.stroke();
	    	
		// Draw horizontal grid lines
		scopeCanvasCtx.beginPath();
	    	scopeCanvasCtx.moveTo(0, linePos);
	    	scopeCanvasCtx.lineTo(360, linePos);
	    	scopeCanvasCtx.stroke();
	}

	// Draw minor divisions
	scopeCanvasCtx.strokeStyle = "grey";
	scopeCanvasCtx.lineWidth = 1;
	
	for(let i = 0; i < 1; i += (1/(numberOfDivisions * 5))) {
		const linePos = Math.abs((360 * i) - 1);
	    	
		// Draw vertical grid lines
		scopeCanvasCtx.beginPath();
	    	scopeCanvasCtx.moveTo(linePos, 0);
	    	scopeCanvasCtx.lineTo(linePos, 360);
	    	scopeCanvasCtx.stroke();
	    	
		// Draw horizontal grid lines
		scopeCanvasCtx.beginPath();
	    	scopeCanvasCtx.moveTo(0, linePos);
	    	scopeCanvasCtx.lineTo(360, linePos);
	    	scopeCanvasCtx.stroke();
	}

}


const drawSignalTrace = async (amplitude, period, phaseShift, vOffset, hOffset) => {

	// Get y coordinates for signal (going across a double width display to facilitate realistic horizontal offset)
	let yPoints = [];
	for(let x = 0; x <= scopeCanvas.width * 1.5; x++) {
		// Get y value for dot at x
		const y = Math.sin(degreesToRadians(period * (x + phaseShift)));
		
		// Scale y value to get absolute pixel position
		const yPosition = 178 - (amplitude * y + vOffset) * 180;
		yPoints.push(yPosition);
	}

	// Check if any points fall within the trigger level (comparison of absolute pixel values)
	if(triggerYPosition <= Math.max(...yPoints) && triggerYPosition >= Math.min(...yPoints)) {
		triggered = true;
	}
	
	let triggerPhaseMod = 0; // Used to modify trace phase based on trigger level

	// If triggered or trigger is on "auto" mode, draw signal trace
	if(triggered || triggerModeSelect.value == "auto") {
		// Find trigger level phase shift (horziontal offset)
		for(let x = 0; x <= scopeCanvas.width * 1.5; x++) {	
			const previousXValue = x == 0 ? 0 : x - 1;
			const nextXValue = x == scopeCanvas.width * 1.5 ? scopeCanvas.width * 1.5 : x + 1;

			if(triggered && (yPoints[previousXValue] >= triggerYPosition && yPoints[nextXValue] <= triggerYPosition)) {
				// If trigger level is between two adjacent Y points, signal should be offset horizontally by x value
				triggerPhaseMod = x;
				break;
			}
		}
		
		// Draw signal trace
		let x = 0;
		for await(const y of yPoints) {
			scopeCanvasCtx.fillStyle = traceGreen;
			scopeCanvasCtx.strokeStyle = traceGreen;
			scopeCanvasCtx.lineWidth = 3;
			
			const previousXValue = x == 0 ? 0 : x - 1;
			const nextXValue = x == scopeCanvas.width * 1.5 ? scopeCanvas.width * 1.5 : x + 1;
			const previousYValue = yPoints[previousXValue];
			const nextYValue = yPoints[nextXValue];

			// Implement phase shift caused by trigger level and manual horizontal offset control
			const xMod = triggerPhaseMod + hOffset;
	
			if(timebaseSelect.value < 0.05) {
				scopeCanvasCtx.beginPath();
				scopeCanvasCtx.moveTo(previousXValue - xMod, previousYValue);
				scopeCanvasCtx.lineTo(nextXValue - xMod, nextYValue);
				scopeCanvasCtx.stroke();
			} else {
				scopeCanvasCtx.fillStyle = faintTraceGreen;
				scopeCanvasCtx.fillRect(x - xMod, yPoints[x], 2, 2);
			}

			// If trigger is on "auto" mode and not triggered, draw out of phase copies of signal
			if(triggered == false && triggerModeSelect.value == "auto") {
				scopeCanvasCtx.fillStyle = traceGreen;
				scopeCanvasCtx.fillRect(x - xMod, yPoints[x], 3, 3);
				scopeCanvasCtx.fillRect(x - (360 / numberOfDivisions) + hOffset, yPoints[x], 3, 3);
				scopeCanvasCtx.fillRect(x - (180 / numberOfDivisions) + hOffset, yPoints[x], 3, 3);
			}

			if(timebaseSelect.value >= 0.1) {
				await sleep(((timebaseSelect.value * numberOfDivisions) / 360) * 1e3);
			}
			lastDotDrawnTimestamp = performance.now();
			
			x++;
		}
	}
	
	if(timebaseSelect.value >= 0.1) {
		refreshDisplay();
	}

}

const drawTriggerLevel = (triggerLevel) => {
	scopeCanvasCtx.strokeStyle = "orange";
	scopeCanvasCtx.lineWidth = 1;
	
	// Get trigger level as absolute pixel Y coordinate
	const yPosition = 178 - (triggerLevel * (360 / numberOfDivisions));
	
	// Feed absolute Y position of trigger level back to trace drawing routine
	triggerYPosition = Math.floor(yPosition); 

	// Draw trigger level
	scopeCanvasCtx.beginPath();
	scopeCanvasCtx.moveTo(0, yPosition);
	scopeCanvasCtx.lineTo(scopeCanvas.width, yPosition);
	scopeCanvasCtx.stroke();
}


const randomInt = (min, max) => {
	// Returns a random integer between min and max (inclusive)
	return Math.floor(Math.random() * (max - min + 1) + min);
}

const degreesToRadians = (degrees) => {
	// Returns degrees as radians, for use with Math.sin()
	return degrees * (Math.PI/180);
}

const sleep = (msDelay) => {

	return new Promise(resolve => { dotDrawDelayTimeout = setTimeout(resolve, msDelay); } );
}

const killSleep = () => {
	clearTimeout(dotDrawDelayTimeout);
}

window.onload = () => {
	// Setup canvas
	scopeCanvas = document.getElementById("scopeCanvas");
	scopeCanvasCtx = scopeCanvas.getContext("2d");
	
	// Find input signal parameter controls in DOM
	inputSignalAmplitudeInput = document.getElementById("inputSignalAmplitude");
	inputSignalFrequencyInput = document.getElementById("inputSignalFrequency");
	inputSignalDCOffsetInput = document.getElementById("inputSignalDCOffset");

	// Find oscilloscope settings in DOM
	timebaseSelect = document.getElementById("timebase");
	xOffsetInput = document.getElementById("xOffset");
	ySensitivitySelect = document.getElementById("ySensitivity");
	yOffsetInput = document.getElementById("yOffset");
	couplingModeSelect = document.getElementById("couplingMode");
	triggerLevelInput = document.getElementById("triggerLevel");
	triggerModeSelect = document.getElementById("triggerMode");

	// Refresh display when any input is interacted with
	const inputControls = document.querySelectorAll('input, select');
	
	for(let element = 0; element < inputControls.length; element++) {
		inputControls[element].addEventListener('change', (event) => {
			refreshDisplay();
		});
	}

	// Handle "Show/Hide Input Signal Parameters" button click
	document.getElementById("toggleInputControlsDisplay").addEventListener('click', (event) => {
		const inputControls = document.getElementById("inputSignalControls");
		const inputControlsLabel = document.getElementById("showHideInputControlsLabel");
		
		// Toggle display state
		showInputSignalControls = !showInputSignalControls;
		if(showInputSignalControls) {
			inputControls.style.display = "block";
			inputControlsLabel.textContent = "Hide"; // Change button text
		} else {
			inputControls.style.display = "none";
			inputControlsLabel.textContent = "Show"; // Change button text
		}
	});

	// Handle "Randomise Input Signal" button click
	document.getElementById("randomiseInputSignalButton").addEventListener('click', (event) => {
		const settings = [inputSignalAmplitudeInput, inputSignalFrequencyInput, inputSignalDCOffsetInput];
		randomiseInputs(settings);
	});

	// Handle "Randomise Oscilloscope Settings" button click
	document.getElementById("randomiseOscilloscopeSettingsButton").addEventListener('click', (event) => {
		const settings = [timebaseSelect, xOffsetInput, ySensitivitySelect, yOffsetInput, couplingModeSelect, triggerLevelInput, triggerModeSelect];
		randomiseInputs(settings);
	});

	// Update display for first time
	refreshDisplay();
}