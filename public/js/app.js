// KuraTe entry point
import { setupLandingPageAgeGate, initAuthForms } from './authFlows.js';
import { initBootstrap } from './bootstrap.js';
import { initSessionIdleTimeout, registerSessionCleanup } from './sessionIdle.js';
import { removeLaunchCurtain } from './launchCurtain.js';

registerSessionCleanup(() => removeLaunchCurtain());

setupLandingPageAgeGate();
initAuthForms();
initBootstrap();
initSessionIdleTimeout();
