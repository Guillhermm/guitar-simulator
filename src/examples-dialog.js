const make = (tag, className, parent, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (parent) parent.append(node);
  return node;
};

export const DEFAULT_GROUP = 'More examples';

const byTitle = (a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });

// Songs split by their group, each group sorted by title and the groups ordered by their first title,
// so the list reads alphabetically column by column.
export const groupSongs = (songs) => {
  const groups = new Map();
  songs.forEach((song) => {
    const name = song.group ?? DEFAULT_GROUP;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(song);
  });
  return [...groups].map(([name, list]) => ({ name, songs: [...list].sort((a, b) => byTitle(a.title, b.title)) }))
    .sort((a, b) => byTitle(a.songs[0].title, b.songs[0].title));
};

// A modal <dialog> listing the songs in one column per group (stacked on a narrow screen). Escape,
// the Close button and a click on the backdrop close it; the arrow keys move between songs. Choosing
// one closes the dialog and reports it through onPick.
export const buildExamplesDialog = (songs, { onPick }) => {
  const dialog = make('dialog', 'examples');
  dialog.setAttribute('aria-labelledby', 'examples-title');
  make('h2', 'examples-title', dialog, 'Example songs').id = 'examples-title';
  make('p', 'examples-intro', dialog, 'Pick one to load it. Editing starts off, so nothing changes by accident.');
  const columns = make('div', 'examples-groups', dialog);
  const songButton = (song, list) => {
    const choose = make('button', 'example', make('li', null, list));
    choose.type = 'button';
    make('span', 'example-title', choose, song.title);
    make('span', 'example-by', choose, [song.artist, song.arranger && `arr. ${song.arranger}`].filter(Boolean).join(' · '));
    if (song.note) make('span', 'example-note', choose, song.note);
    choose.addEventListener('click', () => {
      dialog.close();
      onPick(song);
    });
    return choose;
  };
  const groups = groupSongs(songs);
  // Side by side, the columns share their rows (CSS subgrid), so cards next to each other match in height.
  columns.style.setProperty('--groups', String(groups.length));
  const rows = Math.max(...groups.map((g) => g.songs.length));
  columns.style.setProperty('--rows', String(rows));
  columns.style.setProperty('--group-rows', String(rows + 1));
  const buttons = groups.flatMap(({ name, songs: inGroup }, i) => {
    const section = make('section', 'examples-group', columns);
    const heading = make('h3', 'examples-group-title', section, name);
    heading.id = `examples-group-${i}`;
    section.setAttribute('aria-labelledby', heading.id);
    const list = make('ul', 'examples-list', section);
    return inGroup.map((song) => songButton(song, list));
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
