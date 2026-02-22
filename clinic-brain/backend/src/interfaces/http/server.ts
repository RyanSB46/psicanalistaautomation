import { app } from './app'
import { env } from '../../infra/config/env'
import { startAppointmentReminderScheduler } from '../../application/services/reminders/appointment-reminder-jobs.service'

app.listen(env.PORT, () => {
  startAppointmentReminderScheduler()
  console.log(`Backend running on http://localhost:${env.PORT}${env.API_PREFIX}`)
})
