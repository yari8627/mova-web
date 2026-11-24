// Synthetic property, street, reference and dates. Never copied from a personal email.
module.exports=({country='Norvegia',address='Via Aurora di Prova 42, 9050 Borgo Esempio, Norvegia',inline=true}={})=>`<div>Messaggio inoltrato</div><div>Da: Booking.com &lt;noreply@booking.com&gt;</div>
<h2>Hotel Aurora Sintetica</h2><p>La tua prenotazione è confermata.</p>
<table><tr><td>Conferma:</td><td>8642 135 790</td></tr></table>
<p><a href="https://example.invalid/map"><span>${address.split(', ')[0]}</span><br><span>${address.split(', ').slice(1).join(', ')}</span></a></p>
${inline?'<p><strong>Check-in:</strong> 14/01/2027 dalle 15:00</p><p><strong>Check-out:</strong> 16/01/2027 entro le 12:00</p>':'<table><tr><td>Check-in</td><td>14/01/2027</td><td>dalle 15:00</td></tr><tr><td>Check-out</td><td>16/01/2027</td><td>entro le 12:00</td></tr></table>'}
<p>Ospiti: 2 adulti</p>`;
