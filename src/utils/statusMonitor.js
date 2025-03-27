// src/utils/statusMonitor.js
class StatusMonitor {
    constructor() {
        this.stats = {
            startTime: Date.now(),
            commandsProcessed: 0,
            apiCalls: {
                total: 0,
                successful: 0,
                failed: 0
            },
            lastErrors: []
        };
    }

    // Record a command execution
    trackCommand(commandName, success = true, error = null, executionTime = null) {
        this.stats.commandsProcessed++;

        if (!success && error) {
            this.recordError('command', commandName, error);
        }
    }

    // Record an API call
    trackApiCall(endpoint, success = true, error = null) {
        this.stats.apiCalls.total++;

        if (success) {
            this.stats.apiCalls.successful++;
        } else {
            this.stats.apiCalls.failed++;
            if (error) {
                this.recordError('api', endpoint, error);
            }
        }
    }

    // Record an error
    recordError(type, context, error) {
        // Keep only the last 10 errors
        if (this.stats.lastErrors.length >= 10) {
            this.stats.lastErrors.shift();
        }

        this.stats.lastErrors.push({
            type,
            context,
            message: error.message,
            timestamp: Date.now()
        });
    }

    // Get uptime in a human-readable format
    getUptime() {
        const uptime = Date.now() - this.stats.startTime;
        const seconds = Math.floor(uptime / 1000) % 60;
        const minutes = Math.floor(uptime / (1000 * 60)) % 60;
        const hours = Math.floor(uptime / (1000 * 60 * 60)) % 24;
        const days = Math.floor(uptime / (1000 * 60 * 60 * 24));

        return `${days}d ${hours}h ${minutes}m ${seconds}s`;
    }

    // Get API success rate
    getApiSuccessRate() {
        if (this.stats.apiCalls.total === 0) return "N/A";
        return ((this.stats.apiCalls.successful / this.stats.apiCalls.total) * 100).toFixed(1) + "%";
    }

    // Get complete status report
    getStatusReport() {
        return {
            uptime: this.getUptime(),
            commandsProcessed: this.stats.commandsProcessed,
            apiCalls: {
                total: this.stats.apiCalls.total,
                successful: this.stats.apiCalls.successful,
                failed: this.stats.apiCalls.failed,
                successRate: this.getApiSuccessRate()
            },
            lastErrors: this.stats.lastErrors
        };
    }
}

// Export a singleton instance
module.exports = new StatusMonitor();