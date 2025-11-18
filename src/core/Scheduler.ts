import cron from 'node-cron';
import { logger } from '../utils/logger.js';

export interface ScheduleConfig {
  cronExpression: string;
  timezone?: string;
}

export interface ScheduledTask {
  id: string;
  name: string;
  schedule: string;
  task: () => Promise<void>;
  enabled: boolean;
}

export class Scheduler {
  private tasks: Map<string, { task: ScheduledTask; cronTask: cron.ScheduledTask | null }> = new Map();

  /**
   * Add a scheduled task
   */
  addTask(task: ScheduledTask): void {
    if (this.tasks.has(task.id)) {
      logger.warn(`Task ${task.id} already exists. Updating...`);
      this.removeTask(task.id);
    }

    this.tasks.set(task.id, {
      task,
      cronTask: null
    });

    logger.info(`Task added: ${task.name} (${task.id}) - Schedule: ${task.schedule}`);

    if (task.enabled) {
      this.startTask(task.id);
    }
  }

  /**
   * Start a scheduled task
   */
  startTask(taskId: string): boolean {
    const taskEntry = this.tasks.get(taskId);
    if (!taskEntry) {
      logger.error(`Task ${taskId} not found`);
      return false;
    }

    if (taskEntry.cronTask) {
      logger.warn(`Task ${taskId} is already running`);
      return false;
    }

    const { task } = taskEntry;

    // Validate cron expression
    if (!cron.validate(task.schedule)) {
      logger.error(`Invalid cron expression for task ${taskId}: ${task.schedule}`);
      return false;
    }

    try {
      const cronTask = cron.schedule(task.schedule, async () => {
        logger.info(`Executing scheduled task: ${task.name} (${task.id})`);
        const startTime = Date.now();

        try {
          await task.task();
          const duration = Date.now() - startTime;
          logger.info(`Task ${task.name} completed in ${duration}ms`);
        } catch (error) {
          logger.error(`Task ${task.name} failed:`, error);
        }
      });

      taskEntry.cronTask = cronTask;
      logger.info(`Task ${task.name} started with schedule: ${task.schedule}`);
      return true;

    } catch (error) {
      logger.error(`Failed to start task ${taskId}:`, error);
      return false;
    }
  }

  /**
   * Stop a scheduled task
   */
  stopTask(taskId: string): boolean {
    const taskEntry = this.tasks.get(taskId);
    if (!taskEntry) {
      logger.error(`Task ${taskId} not found`);
      return false;
    }

    if (!taskEntry.cronTask) {
      logger.warn(`Task ${taskId} is not running`);
      return false;
    }

    taskEntry.cronTask.stop();
    taskEntry.cronTask = null;
    logger.info(`Task ${taskEntry.task.name} stopped`);
    return true;
  }

  /**
   * Remove a scheduled task
   */
  removeTask(taskId: string): boolean {
    const taskEntry = this.tasks.get(taskId);
    if (!taskEntry) {
      logger.error(`Task ${taskId} not found`);
      return false;
    }

    if (taskEntry.cronTask) {
      this.stopTask(taskId);
    }

    this.tasks.delete(taskId);
    logger.info(`Task ${taskEntry.task.name} removed`);
    return true;
  }

  /**
   * Get all tasks
   */
  getTasks(): ScheduledTask[] {
    return Array.from(this.tasks.values()).map(entry => entry.task);
  }

  /**
   * Get a specific task
   */
  getTask(taskId: string): ScheduledTask | null {
    const taskEntry = this.tasks.get(taskId);
    return taskEntry ? taskEntry.task : null;
  }

  /**
   * Check if a task is running
   */
  isTaskRunning(taskId: string): boolean {
    const taskEntry = this.tasks.get(taskId);
    return taskEntry ? taskEntry.cronTask !== null : false;
  }

  /**
   * Start all enabled tasks
   */
  startAll(): void {
    logger.info('Starting all enabled scheduled tasks');
    for (const [taskId, taskEntry] of this.tasks) {
      if (taskEntry.task.enabled && !taskEntry.cronTask) {
        this.startTask(taskId);
      }
    }
  }

  /**
   * Stop all running tasks
   */
  stopAll(): void {
    logger.info('Stopping all scheduled tasks');
    for (const [taskId, taskEntry] of this.tasks) {
      if (taskEntry.cronTask) {
        this.stopTask(taskId);
      }
    }
  }

  /**
   * Get status of all tasks
   */
  getStatus(): Array<{ id: string; name: string; schedule: string; running: boolean; enabled: boolean }> {
    return Array.from(this.tasks.values()).map(entry => ({
      id: entry.task.id,
      name: entry.task.name,
      schedule: entry.task.schedule,
      running: entry.cronTask !== null,
      enabled: entry.task.enabled
    }));
  }

  /**
   * Create a one-time delayed task
   */
  scheduleOnce(name: string, delayMs: number, task: () => Promise<void>): NodeJS.Timeout {
    logger.info(`Scheduling one-time task "${name}" to run in ${delayMs}ms`);

    return setTimeout(async () => {
      logger.info(`Executing one-time task: ${name}`);
      try {
        await task();
        logger.info(`One-time task ${name} completed`);
      } catch (error) {
        logger.error(`One-time task ${name} failed:`, error);
      }
    }, delayMs);
  }
}

/**
 * Common cron schedule patterns for reference:
 *
 * Every minute:        '* * * * *'
 * Every 5 minutes:     '*\/5 * * * *'
 * Every hour:          '0 * * * *'
 * Every day at 2am:    '0 2 * * *'
 * Every day at noon:   '0 12 * * *'
 * Every Monday at 9am: '0 9 * * 1'
 * Twice daily:         '0 8,20 * * *'
 * Every weekday:       '0 9 * * 1-5'
 */

export const commonSchedules = {
  everyMinute: '* * * * *',
  every5Minutes: '*/5 * * * *',
  every15Minutes: '*/15 * * * *',
  every30Minutes: '*/30 * * * *',
  everyHour: '0 * * * *',
  every6Hours: '0 */6 * * *',
  daily2am: '0 2 * * *',
  daily9am: '0 9 * * *',
  dailyNoon: '0 12 * * *',
  daily6pm: '0 18 * * *',
  twiceDaily: '0 8,20 * * *',
  weekdays9am: '0 9 * * 1-5',
  weekends10am: '0 10 * * 0,6',
  mondayMorning: '0 9 * * 1'
};
