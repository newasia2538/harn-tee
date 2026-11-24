"use client";
import {useParams} from "next/navigation";
import {HarnTeeApp} from "../../../harn-tee-client";
export default function HistoryDraftPage(){const {localId}=useParams<{localId:string}>();return <HarnTeeApp key={localId} localId={localId}/>;}
