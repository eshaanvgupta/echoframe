export function download(name:string,text:string,mime='application/json'):void{
  const url=URL.createObjectURL(new Blob([text],{type:mime}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export const pretty=(value:unknown)=>JSON.stringify(value,null,2);
export const errorText=(error:unknown)=>error instanceof Error?error.message:String(error);
export async function copy(text:string):Promise<void>{await navigator.clipboard.writeText(text);}
export function short(value:string,n=8):string{return value.length>n*2+3?value.slice(0,n+2)+'…'+value.slice(-n):value;}
/** Keep static downloads inside the deployed application, including GitHub project Pages. */
export function sitePath(path:string):string{return import.meta.env.BASE_URL+path.replace(/^\//,'');}
