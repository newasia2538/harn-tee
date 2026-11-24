import type {ComponentProps} from "react";
/** Full document navigation preserves native links when the Vinext client router is unavailable. */
export function DocumentLink(props:ComponentProps<"a">){return <a {...props}/>;}
