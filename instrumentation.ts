// Next.js calls this once at server startup.
// We use it to spin up the in-process cron jobs (sync + monthly report).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startCronJobs } = await import('./lib/cron-jobs')
    startCronJobs()
  }
}
