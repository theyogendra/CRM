// Vercel entry point for the API. Vercel loads this module and serves the exported app;
// it must not call listen(). The follow-up scheduler and the job worker are not started here:
// they need a long-running process, so they stay on a separate host (see the deployment notes).
import 'dotenv/config';
import { createApp } from '../src/app';
import { assertJwtSecret } from '../src/lib/auth';

assertJwtSecret();
export default createApp();
