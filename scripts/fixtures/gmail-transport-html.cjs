// Synthetic HTML only: no real email, passenger, reference or attachment data.
const row=(labels,values)=>`<tr>${labels.map(v=>`<th>${v}</th>`).join('')}</tr><tr>${values.map(v=>`<td>${v}</td>`).join('')}</tr>`;
function italoHtml({date='31/12',reordered=false,empty=false}={}){
 return `<html><body><p>Italo &lt;booking@italotreno.it&gt;</p><p>Conferma Acquisto</p><p>PNR: SYNTHITALO21</p>
 <table>${row(['Partenza','Arrivo'],['Napoli C.LE','Milano Rog'])}${row(['Data viaggio','Orari','Numero treno'],[date,'14:15 &gt; 19:09','9946'])}
 ${reordered?row(['Posti','Ambiente','Carrozza'],[empty?'':'23, 24','Smart','10']):row(['Ambiente','Carrozza','Posto'],['Smart','10',empty?'':'23, 24'])}</table>
 <footer><table>${row(['Ambiente','Carrozza','Posto'],['Business','99','99'])}</table>Offerta commerciale 2029</footer>
 <script>throw new Error('never execute')</script><img src="https://invalid.example/no-request"></body></html>`;
}
function easyjetHtml({roundTrip=false}={}){
 const leg=(from,to,date,start,end,flight)=>`<table>${row(['From','To'],[from,to])}${row(['Flight date','Departure time','Arrival time','Flight number'],[date,start,end,flight])}</table>`;
 return `<p>easyJet &lt;booking@easyjet.com&gt;</p><p>Booking confirmation</p><p>Booking reference: SYNTHJET21</p>${leg('FCO','LGW','12 luglio 2027','14:15','16:09','U21234')}${roundTrip?leg('LGW','FCO','19 luglio 2027','11:00','14:20','U24321'):''}`;
}
module.exports={italoHtml,easyjetHtml};
