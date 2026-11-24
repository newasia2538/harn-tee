export function SadReceipt({size=150}:{size?:number}){
 return <div className="sad-receipt-scene" style={{width:size,height:size}} role="img" aria-label="ใบเสร็จหน้าเศร้า"><div className="sad-receipt"><i className="sad-eye sad-eye-left"/><i className="sad-eye sad-eye-right"/><i className="sad-mouth"/><span/><span/><span/></div><div className="sad-receipt-cross">×</div></div>;
}
