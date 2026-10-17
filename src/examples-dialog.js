const make = (tag, className, parent, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (parent) parent.append(node);
  return node;
};

// A modal <dialog> listing the songs. Escape, the Close button and a click on the backdrop close it;
// the arrow keys move between songs. Choosing one closes the dialog and reports it through onPick.
export const buildExamplesDialog = (songs, { onPick }) => {
  const dialog = make('dialog', 'examples');
  dialog.setAttribute('aria-labelledby', 'examples-title');
  make('h2', 'examples-title', dialog, 'Example songs').id = 'examples-title';
  make('p', 'examples-intro', dialog, 'Pick one to load it. Editing starts off, so nothing changes by accident.');
  const list = make('ul', 'examples-list', dialog);
  const buttons = songs.map((song) => {
    const item = make('li', null, list);
    const choose = make('button', 'example', item);
    choose.type = 'button';
    make('span', 'example-title', choose, song.title);
    make('span', 'example-by', choose, [song.artist, song.arranger && `arr. ${song.arranger}`].filter(Boolean).join(' · '));
    if (song.note) make('span', 'example-note', choose, song.note);
    choose.addEventListener('click', () => {
      dialog.close();
      onPick(song);
    });
    return choose;
  });
  const close = make('button', 'btn examples-close', dialog, 'Close');
  close.type = 'button';
  close.addEventListener('click', () => dialog.close());

  dialog.addEventListener('keydown', (e) => {
    const step = { ArrowDown: 1, ArrowUp: -1 }[e.key];
    const at = buttons.indexOf(document.activeElement);
    if (!step || at < 0) return;
    e.preventDefault();
    buttons[(at + step + buttons.length) % buttons.length].focus();
  });
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });

  return {
    dialog,
    open: () => {
      if (!dialog.open) dialog.showModal();
      buttons[0]?.focus();
    },
    isOpen: () => dialog.open === true,
  };
};
