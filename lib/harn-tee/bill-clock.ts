import {createRetentionClock} from "./retention-clock";
/** One monotonic server-time anchor shared by acknowledgements and countdowns. */
export const billServerClock=createRetentionClock(()=>performance.now());
