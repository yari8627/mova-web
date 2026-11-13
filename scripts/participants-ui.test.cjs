const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness, people, nodes, find, flush } = require('./participants-fixture.cjs');

test('group count includes the same records while distinguishing confirmed and pending members', () => {
  const h = harness(), html = h.html();
  assert(html.includes('3 persone nel gruppo')); assert(html.includes('Confermati 2')); assert(html.includes('In attesa 1'));
  for (const text of ['Proprietario', 'Co-organizzatore', 'Partecipante', 'alice@example.test']) assert(html.includes(text));
  assert(!html.includes('aria-label="Rimuovi Alice"'));
  assert(html.includes('aria-label="Modifica Carol"'));
  assert(harness({ members: [people[0]] }).html().includes('1 persona nel gruppo'));
});
test('only authorized roles see invite and member management controls', () => {
  for (const role of ['owner', 'co-organizer', 'participant', null]) {
    const h = harness({ role });
    const actions = nodes(h.render()).filter(n => n.props?.onClick?.name === 'openNew');
    assert.equal(actions.length, role === 'owner' || role === 'co-organizer' ? 1 : 0);
    assert.equal(h.html().includes('aria-label="Rimuovi Bob"'), role === 'owner');
    if (actions.length) {
      actions[0].props.onClick();
      const options = nodes(h.render()).filter(n => n.type === 'option').map(n => n.props.value);
      assert.deepEqual(options, role === 'owner' ? ['participant', 'co-organizer'] : ['participant']);
    }
  }
});

test('UX-019 has one upper invite action in empty, confirmed and pending groups without a duplicate panel', () => {
  for (const members of [[], people.slice(0, 2), people]) {
    const h = harness({ members });
    const actions = nodes(h.render()).filter(n => n.props?.onClick?.name === 'openNew');
    assert.equal(actions.length, 1);
    assert(!h.html().includes('Crea invito'));
    assert(!h.html().includes('invite-panel'));
    actions[0].props.onClick();
    assert.equal(h.state[3], true);
    assert.equal(h.state[1].status, 'pending');
    assert(h.html().includes('Nuovo invito'));
    assert.equal(h.calls.filter(c => c.url).length, 0);
  }
});

test('UX-019 preserves the post-success copy panel for authorized users only', () => {
  for (const role of ['owner', 'co-organizer', 'participant', null]) {
    const h = harness({ role });
    h.state[5] = 'NAMI-TEST'; h.state[6] = 'https://nami.example.test/invite/NAMI-TEST';
    assert.equal(h.html().includes('Copia link invito'), role === 'owner' || role === 'co-organizer');
    assert(!h.html().includes('Crea invito'));
  }
});
test('existing invite flow preserves required email, pending state, creation endpoint and link copy', async () => {
  const h = harness();
  find(h, n => n.props?.onClick?.name === 'openNew').props.onClick();
  assert(!nodes(h.render()).some(n => n.type === 'input' && n.props.placeholder === 'Nome del partecipante'));
  const email = find(h, n => n.type === 'input' && n.props.type === 'email');
  assert.equal(email.props.required, true);
  email.props.onChange({ target: { value: 'invitee@example.test' } });
  find(h, n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  await flush();
  const request = h.calls.find(c => c.url);
  assert.equal(request.url, '/api/trips/trip/invites');
  assert.deepEqual(JSON.parse(request.options.body), { email: 'invitee@example.test', role: 'participant', intent: 'send' });
  assert(request.options.headers['Idempotency-Key']);
  assert.equal(h.state[0].at(-1).status, 'pending'); assert.equal(h.state[3], false);
  find(h, n => n.props?.['aria-label'] === 'Copia link invito').props.onClick();
  await flush();
  assert.equal(h.calls.find(c => c.copied).copied, 'https://nami.example.test/invite/NAMI-TEST');
  assert(h.html().includes('Link copiato'));
});
test('edit and removal preserve owner protection and existing sync rollback', async () => {
  const h = harness();
  find(h, n => n.props?.['aria-label'] === 'Modifica Carol').props.onClick();
  assert.equal(h.state[1].status, 'pending');
  h.state[1] = { ...h.state[1], name: 'Carolina', role: 'co-organizer' };
  find(h, n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  await flush();
  const sync = h.calls.find(c => c.sync).sync;
  assert.equal(sync[1], 'participants'); assert(!sync[2].some(p => p.role === 'owner'));
  assert.equal(sync[2].find(p => p.id === 'carol').role, 'co-organizer');
  find(h, n => n.props?.['aria-label'] === 'Rimuovi Carolina').props.onClick();
  await flush();
  assert.equal(h.state[0].length, 2);
  const failed = harness({ syncOK: false });
  find(failed, n => n.props?.['aria-label'] === 'Rimuovi Carol').props.onClick();
  await flush();
  assert.equal(failed.state[0].length, 3);
});
test('rejected invitation keeps existing people and editor without fabricating success', async () => {
  const h = harness({ inviteOK: false });
  find(h, n => n.props?.onClick?.name === 'openNew').props.onClick();
  h.state[1] = { ...h.state[1], email: 'bad@example.test' };
  find(h, n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  await flush();
  assert.equal(h.state[0].length, 3); assert.equal(h.state[3], true); assert.equal(h.state[5], '');
});

test('five rapid click/Enter submissions lock the actual form before network completion and announce success', async () => {
  const h = harness({ deferred: true });
  find(h, n => n.props?.onClick?.name === 'openNew').props.onClick();
  h.state[1] = { ...h.state[1], email: 'invitee@example.test' };
  const submit = find(h, n => n.type === 'form').props.onSubmit;
  for (let i = 0; i < 5; i++) submit({ preventDefault() {} });
  assert.equal(h.calls.filter(c => c.url).length, 1);
  const button = find(h, n => n.type === 'button' && n.props.type === 'submit');
  assert.equal(button.props.disabled, true); assert.equal(button.props['aria-busy'], true);
  assert(h.html().includes('Invio in corso…')); assert.equal(h.state[3], true);
  h.release(); await flush();
  assert(h.html().includes('Invito inviato')); assert.equal(h.state[0].at(-1).email, 'invitee@example.test');
  assert.equal(h.state[3], false); assert.equal(h.state[1].email, '');
});
