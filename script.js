class KingdomTimer {
    constructor() {
        this.settings = {
            workDuration: 25,
            shortBreak: 5,
            longBreak: 10,
            sessionsPerCycle: 4
        };
        
        this.state = {
            isRunning: false,
            currentSession: 1,
            currentCycle: 1,
            isWorkSession: true,
            timeLeft: this.settings.workDuration * 60,
            totalTime: this.settings.workDuration * 60,
            currentPrayer: '',
            reflectionHistory: [],
            startTime: null,
            endTime: null
        };
        
        this.interval = null;
        this.opfsRoot = null;
        this.audioContext = null;
        
        this.initializeElements();
        this.loadSettingsFromURL();
        this.initializeOPFS();
        this.initializeAudio();
        this.updateDisplay();
        this.setStaticFavicon();
        this.bindEvents();
    }
    
    initializeElements() {
        this.elements = {
            timeDisplay: document.getElementById('time-display'),
            sessionType: document.getElementById('session-type'),
            sessionCount: document.getElementById('session-count'),
            progressFill: document.getElementById('progress-fill'),
            playPauseBtn: document.getElementById('play-pause-btn'),
            skipBtn: document.getElementById('skip-btn'),
            settingsBtn: document.getElementById('settings-btn'),
            prayerSection: document.getElementById('prayer-section'),
            prayerInput: document.getElementById('prayer-input'),
            startSessionBtn: document.getElementById('start-session-btn'),
            reflectionSection: document.getElementById('reflection-section'),
            prayerDisplay: document.getElementById('prayer-display'),
            reflectionInput: document.getElementById('reflection-input'),
            saveReflectionBtn: document.getElementById('save-reflection-btn'),
            settingsPanel: document.getElementById('settings-panel'),
            workDurationInput: document.getElementById('work-duration'),
            shortBreakInput: document.getElementById('short-break'),
            longBreakInput: document.getElementById('long-break'),
            sessionsPerCycleInput: document.getElementById('sessions-per-cycle'),
            saveSettingsBtn: document.getElementById('save-settings-btn'),
            cancelSettingsBtn: document.getElementById('cancel-settings-btn'),
            exportBtn: document.getElementById('export-btn'),
            historyBtn: document.getElementById('history-btn'),
            historyPanel: document.getElementById('history-panel'),
            historyContent: document.getElementById('history-content'),
            clearHistoryBtn: document.getElementById('clear-history-btn'),
            closeHistoryBtn: document.getElementById('close-history-btn'),
            importBtn: document.getElementById('import-btn'),
            importFile: document.getElementById('import-file')
        };
    }
    
    async initializeOPFS() {
        try {
            this.opfsRoot = await navigator.storage.getDirectory();
            await this.loadHistoryFromOPFS();
        } catch (error) {
            console.warn('OPFS not supported, data will not persist');
        }
    }
    
    initializeAudio() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (error) {
            console.warn('Web Audio API not supported');
        }
    }
    
    playAlarmSound() {
        if (!this.audioContext) return;
        
        // Play chimes for 10 seconds
        const totalDuration = 10;
        const chimeInterval = 1.5; // Play a chime every 1.5 seconds
        const chimeDuration = 0.8; // Each chime lasts 0.8 seconds
        
        const numberOfChimes = Math.floor(totalDuration / chimeInterval);
        
        for (let i = 0; i < numberOfChimes; i++) {
            const startTime = this.audioContext.currentTime + (i * chimeInterval);
            
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            // Create the chime pattern (880Hz -> 1760Hz -> 880Hz)
            oscillator.frequency.setValueAtTime(880, startTime);
            oscillator.frequency.setValueAtTime(1760, startTime + 0.1);
            oscillator.frequency.setValueAtTime(880, startTime + 0.2);
            
            // Volume envelope for each chime
            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.05);
            gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + chimeDuration);
            
            oscillator.start(startTime);
            oscillator.stop(startTime + chimeDuration);
        }
    }
    
    loadSettingsFromURL() {
        const params = new URLSearchParams(window.location.search);
        const compressed = params.get('s');
        
        if (compressed) {
            try {
                const decoded = this.decodeSettings(compressed);
                this.settings = { ...this.settings, ...decoded };
                this.updateSettingsInputs();
            } catch (error) {
                console.warn('Invalid settings in URL');
            }
        }
    }
    
    encodeSettings() {
        const { workDuration, shortBreak, longBreak, sessionsPerCycle } = this.settings;
        return btoa(`${workDuration},${shortBreak},${longBreak},${sessionsPerCycle}`);
    }
    
    decodeSettings(encoded) {
        const [workDuration, shortBreak, longBreak, sessionsPerCycle] = atob(encoded).split(',').map(Number);
        return { workDuration, shortBreak, longBreak, sessionsPerCycle };
    }
    
    updateURL() {
        const encoded = this.encodeSettings();
        const url = new URL(window.location);
        url.searchParams.set('s', encoded);
        window.history.replaceState({}, '', url);
    }
    
    bindEvents() {
        this.elements.playPauseBtn.addEventListener('click', () => this.toggleTimer());
        this.elements.skipBtn.addEventListener('click', () => this.skipSession());
        this.elements.settingsBtn.addEventListener('click', () => this.showSettings());
        this.elements.startSessionBtn.addEventListener('click', () => this.startWorkSession());
        this.elements.saveReflectionBtn.addEventListener('click', () => this.saveReflection());
        this.elements.saveSettingsBtn.addEventListener('click', () => this.saveSettings());
        this.elements.cancelSettingsBtn.addEventListener('click', () => this.hideSettings());
        this.elements.exportBtn.addEventListener('click', () => this.exportData());
        this.elements.historyBtn.addEventListener('click', () => this.showHistory());
        this.elements.clearHistoryBtn.addEventListener('click', () => this.clearHistory());
        this.elements.closeHistoryBtn.addEventListener('click', () => this.hideHistory());
        this.elements.importBtn.addEventListener('click', () => this.triggerImport());
        this.elements.importFile.addEventListener('change', (e) => this.importData(e));
    }
    
    toggleTimer() {
        if (this.state.isRunning) {
            this.pauseTimer();
        } else {
            this.startTimer();
        }
    }
    
    startTimer() {
        if (this.state.isWorkSession && !this.state.currentPrayer) {
            this.showPrayerInput();
            return;
        }
        
        this.state.isRunning = true;
        this.elements.playPauseBtn.textContent = 'Pause';
        
        // Set start time and end time for time-based calculation
        const now = Date.now();
        this.state.startTime = now;
        this.state.endTime = now + (this.state.timeLeft * 1000);
        
        this.interval = setInterval(() => {
            this.updateTimerFromTimeStamp();
        }, 100);
    }
    
    pauseTimer() {
        this.state.isRunning = false;
        this.elements.playPauseBtn.textContent = 'Resume';
        clearInterval(this.interval);
        
        // Update timeLeft to current remaining time when pausing
        const now = Date.now();
        this.state.timeLeft = Math.max(0, Math.ceil((this.state.endTime - now) / 1000));
    }
    
    updateTimerFromTimeStamp() {
        const now = Date.now();
        const timeLeft = Math.max(0, Math.ceil((this.state.endTime - now) / 1000));
        
        this.state.timeLeft = timeLeft;
        this.updateDisplay();
        
        if (timeLeft <= 0) {
            this.completeSession();
        }
    }
    
    skipSession() {
        this.pauseTimer();
        this.completeSession();
    }
    
    completeSession() {
        this.pauseTimer();
        this.playAlarmSound();
        
        if (this.state.isWorkSession) {
            this.showReflectionInput();
        } else {
            this.nextSession();
        }
    }
    
    nextSession() {
        if (this.state.isWorkSession) {
            const isLongBreak = this.state.currentSession === this.settings.sessionsPerCycle;
            this.state.isWorkSession = false;
            this.state.timeLeft = (isLongBreak ? this.settings.longBreak : this.settings.shortBreak) * 60;
            this.state.totalTime = this.state.timeLeft;
        } else {
            this.state.isWorkSession = true;
            this.state.currentSession++;
            
            if (this.state.currentSession > this.settings.sessionsPerCycle) {
                this.state.currentSession = 1;
                this.state.currentCycle++;
            }
            
            this.state.timeLeft = this.settings.workDuration * 60;
            this.state.totalTime = this.state.timeLeft;
            this.state.currentPrayer = '';
        }
        
        this.state.startTime = null;
        this.state.endTime = null;
        this.elements.playPauseBtn.textContent = 'Start';
        this.updateDisplay();
    }
    
    showPrayerInput() {
        this.elements.prayerSection.classList.remove('hidden');
        this.elements.prayerInput.focus();
    }
    
    startWorkSession() {
        const prayer = this.elements.prayerInput.value.trim();
        if (!prayer) {
            alert('Please write a prayer before starting your work session.');
            return;
        }
        
        this.state.currentPrayer = prayer;
        this.elements.prayerSection.classList.add('hidden');
        this.elements.prayerInput.value = '';
        this.startTimer();
    }
    
    showReflectionInput() {
        this.elements.prayerDisplay.textContent = this.state.currentPrayer;
        this.elements.reflectionSection.classList.remove('hidden');
        this.elements.reflectionInput.focus();
    }
    
    async saveReflection() {
        const reflection = this.elements.reflectionInput.value.trim();
        const sessionData = {
            date: new Date().toISOString(),
            session: this.state.currentSession,
            cycle: this.state.currentCycle,
            prayer: this.state.currentPrayer,
            reflection: reflection
        };
        
        this.state.reflectionHistory.push(sessionData);
        await this.saveToOPFS(sessionData);
        
        this.elements.reflectionSection.classList.add('hidden');
        this.elements.reflectionInput.value = '';
        this.nextSession();
    }
    
    async saveToOPFS(data) {
        if (!this.opfsRoot) return;
        
        try {
            const fileName = `session_${data.date.split('T')[0]}.json`;
            const fileHandle = await this.opfsRoot.getFileHandle(fileName, { create: true });
            const writable = await fileHandle.createWritable();
            
            let existingData = [];
            try {
                const file = await fileHandle.getFile();
                const text = await file.text();
                existingData = JSON.parse(text);
            } catch (e) {
                // File doesn't exist or is empty
            }
            
            existingData.push(data);
            await writable.write(JSON.stringify(existingData, null, 2));
            await writable.close();
        } catch (error) {
            console.error('Error saving to OPFS:', error);
        }
    }
    
    async loadHistoryFromOPFS() {
        if (!this.opfsRoot) return;
        
        try {
            const allData = [];
            
            for await (const [name, handle] of this.opfsRoot.entries()) {
                if (name.startsWith('session_') && name.endsWith('.json')) {
                    const file = await handle.getFile();
                    const text = await file.text();
                    const data = JSON.parse(text);
                    allData.push(...data);
                }
            }
            
            this.state.reflectionHistory = allData.sort((a, b) => new Date(b.date) - new Date(a.date));
        } catch (error) {
            console.error('Error loading history from OPFS:', error);
        }
    }
    
    showHistory() {
        this.renderHistory();
        this.elements.historyPanel.classList.remove('hidden');
    }
    
    hideHistory() {
        this.elements.historyPanel.classList.add('hidden');
    }
    
    renderHistory() {
        const historyContent = this.elements.historyContent;
        
        if (this.state.reflectionHistory.length === 0) {
            historyContent.innerHTML = `
                <div class="history-empty">
                    <p>No prayer sessions yet. Start your first session to see history here.</p>
                </div>
            `;
            return;
        }
        
        const historyHTML = this.state.reflectionHistory.map(session => {
            const date = new Date(session.date);
            const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
            
            return `
                <div class="history-item">
                    <div class="history-item-header">
                        <span class="history-session-info">Session ${session.session}, Cycle ${session.cycle}</span>
                        <span class="history-date">${formattedDate}</span>
                    </div>
                    <div class="history-prayer">${session.prayer}</div>
                    <div class="history-reflection">${session.reflection || 'No reflection recorded'}</div>
                </div>
            `;
        }).join('');
        
        historyContent.innerHTML = historyHTML;
    }
    
    async clearHistory() {
        if (!confirm('Are you sure you want to clear all prayer session history? This action cannot be undone.')) {
            return;
        }
        
        this.state.reflectionHistory = [];
        
        if (this.opfsRoot) {
            try {
                for await (const [name, handle] of this.opfsRoot.entries()) {
                    if (name.startsWith('session_') && name.endsWith('.json')) {
                        await this.opfsRoot.removeEntry(name);
                    }
                }
            } catch (error) {
                console.error('Error clearing history from OPFS:', error);
            }
        }
        
        this.renderHistory();
    }
    
    showSettings() {
        this.updateSettingsInputs();
        this.elements.settingsPanel.classList.remove('hidden');
    }
    
    hideSettings() {
        this.elements.settingsPanel.classList.add('hidden');
    }
    
    updateSettingsInputs() {
        this.elements.workDurationInput.value = this.settings.workDuration;
        this.elements.shortBreakInput.value = this.settings.shortBreak;
        this.elements.longBreakInput.value = this.settings.longBreak;
        this.elements.sessionsPerCycleInput.value = this.settings.sessionsPerCycle;
    }
    
    saveSettings() {
        this.settings.workDuration = parseInt(this.elements.workDurationInput.value);
        this.settings.shortBreak = parseInt(this.elements.shortBreakInput.value);
        this.settings.longBreak = parseInt(this.elements.longBreakInput.value);
        this.settings.sessionsPerCycle = parseInt(this.elements.sessionsPerCycleInput.value);
        
        this.updateURL();
        this.resetTimer();
        this.hideSettings();
    }
    
    resetTimer() {
        this.pauseTimer();
        this.state.currentSession = 1;
        this.state.currentCycle = 1;
        this.state.isWorkSession = true;
        this.state.timeLeft = this.settings.workDuration * 60;
        this.state.totalTime = this.state.timeLeft;
        this.state.currentPrayer = '';
        this.state.startTime = null;
        this.state.endTime = null;
        this.elements.playPauseBtn.textContent = 'Start';
        this.updateDisplay();
    }
    
    async exportData() {
        if (!this.opfsRoot) {
            alert('No data to export - OPFS not supported in this browser.');
            return;
        }
        
        try {
            const allData = [];
            
            for await (const [name, handle] of this.opfsRoot.entries()) {
                if (name.startsWith('session_') && name.endsWith('.json')) {
                    const file = await handle.getFile();
                    const text = await file.text();
                    const data = JSON.parse(text);
                    allData.push(...data);
                }
            }
            
            const exportData = {
                exportDate: new Date().toISOString(),
                sessions: allData,
                settings: this.settings
            };
            
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `kingdom-timer-export-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error exporting data:', error);
            alert('Error exporting data. Please try again.');
        }
    }
    
    triggerImport() {
        this.elements.importFile.click();
    }
    
    async importData(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        try {
            const text = await file.text();
            const importedData = JSON.parse(text);
            
            // Validate the imported data structure
            if (!importedData.sessions || !Array.isArray(importedData.sessions)) {
                alert('Invalid file format. Please select a valid KingdomTimer export file.');
                return;
            }
            
            // Validate each session has required fields
            const validSessions = importedData.sessions.filter(session => {
                return session.date && session.session && session.cycle && 
                       session.prayer && typeof session.reflection !== 'undefined';
            });
            
            if (validSessions.length === 0) {
                alert('No valid sessions found in the import file.');
                return;
            }
            
            // Ask user about merge strategy
            const mergeChoice = confirm(
                `Found ${validSessions.length} valid sessions to import.\n\n` +
                'Click "OK" to merge with existing data\n' +
                'Click "Cancel" to replace all existing data'
            );
            
            if (!mergeChoice) {
                // Replace all data
                await this.clearHistoryData();
                this.state.reflectionHistory = validSessions;
            } else {
                // Merge data - combine and remove duplicates based on date
                const combinedSessions = [...this.state.reflectionHistory, ...validSessions];
                const uniqueSessions = combinedSessions.filter((session, index, self) => 
                    index === self.findIndex(s => s.date === session.date)
                );
                this.state.reflectionHistory = uniqueSessions;
            }
            
            // Sort by date (newest first)
            this.state.reflectionHistory.sort((a, b) => new Date(b.date) - new Date(a.date));
            
            // Save to OPFS
            await this.saveImportedDataToOPFS();
            
            // Update display if history panel is open
            if (!this.elements.historyPanel.classList.contains('hidden')) {
                this.renderHistory();
            }
            
            alert(`Successfully imported ${validSessions.length} prayer sessions!`);
            
        } catch (error) {
            console.error('Error importing data:', error);
            alert('Error importing data. Please ensure the file is a valid JSON export from KingdomTimer.');
        } finally {
            // Clear the file input
            this.elements.importFile.value = '';
        }
    }
    
    async clearHistoryData() {
        this.state.reflectionHistory = [];
        
        if (this.opfsRoot) {
            try {
                for await (const [name, handle] of this.opfsRoot.entries()) {
                    if (name.startsWith('session_') && name.endsWith('.json')) {
                        await this.opfsRoot.removeEntry(name);
                    }
                }
            } catch (error) {
                console.error('Error clearing history from OPFS:', error);
            }
        }
    }
    
    async saveImportedDataToOPFS() {
        if (!this.opfsRoot) return;
        
        try {
            // Group sessions by date
            const sessionsByDate = {};
            this.state.reflectionHistory.forEach(session => {
                const dateKey = session.date.split('T')[0];
                if (!sessionsByDate[dateKey]) {
                    sessionsByDate[dateKey] = [];
                }
                sessionsByDate[dateKey].push(session);
            });
            
            // Save each date group to its own file
            for (const [dateKey, sessions] of Object.entries(sessionsByDate)) {
                const fileName = `session_${dateKey}.json`;
                const fileHandle = await this.opfsRoot.getFileHandle(fileName, { create: true });
                const writable = await fileHandle.createWritable();
                
                await writable.write(JSON.stringify(sessions, null, 2));
                await writable.close();
            }
        } catch (error) {
            console.error('Error saving imported data to OPFS:', error);
        }
    }
    
    updateDisplay() {
        const minutes = Math.floor(this.state.timeLeft / 60);
        const seconds = this.state.timeLeft % 60;
        this.elements.timeDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        if (this.state.isWorkSession) {
            this.elements.sessionType.textContent = 'Work Session';
            this.elements.sessionCount.textContent = `${this.state.currentSession} of ${this.settings.sessionsPerCycle}`;
        } else {
            const isLongBreak = this.state.currentSession === this.settings.sessionsPerCycle;
            this.elements.sessionType.textContent = isLongBreak ? 'Long Break' : 'Short Break';
            this.elements.sessionCount.textContent = `After session ${this.state.currentSession}`;
        }
        
        const progress = ((this.state.totalTime - this.state.timeLeft) / this.state.totalTime) * 100;
        this.elements.progressFill.style.width = `${progress}%`;
        
        this.updateTitle();
    }
    
    updateTitle() {
        if (this.state.isRunning) {
            const minutes = Math.floor(this.state.timeLeft / 60);
            const seconds = this.state.timeLeft % 60;
            const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            document.title = `${timeString} - KingdomTimer`;
        } else {
            document.title = 'KingdomTimer';
        }
    }
    
    setStaticFavicon() {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        
        // Draw blue background with rounded corners
        ctx.fillStyle = '#667eea';
        ctx.beginPath();
        ctx.roundRect(0, 0, 32, 32, 4);
        ctx.fill();
        
        // Draw white clock circle
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(16, 16, 10, 0, 2 * Math.PI);
        ctx.stroke();
        
        // Draw clock hands pointing to 12 and 3 (like a timer starting)
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        // Hour hand (pointing to 12)
        ctx.moveTo(16, 16);
        ctx.lineTo(16, 9);
        // Minute hand (pointing to 3)
        ctx.moveTo(16, 16);
        ctx.lineTo(23, 16);
        ctx.stroke();
        
        // Add center dot
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(16, 16, 1.5, 0, 2 * Math.PI);
        ctx.fill();
        
        // Set the favicon
        let link = document.querySelector("link[rel*='icon']");
        if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            document.head.appendChild(link);
        }
        link.href = canvas.toDataURL();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new KingdomTimer();
    
    // Register service worker for PWA functionality
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then((registration) => {
                console.log('Service Worker registered successfully:', registration);
            })
            .catch((error) => {
                console.log('Service Worker registration failed:', error);
            });
    }
});