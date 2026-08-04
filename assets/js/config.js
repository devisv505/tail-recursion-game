/* Tail Recursion — site configuration.
 *
 * This is the only file you edit to point the site at real destinations.
 * Everything else reads from here. Set a link to null and its button renders
 * as a dimmed "SOON" chip instead of a dead link.
 */

window.SITE_CONFIG = {
  studio: 'DEV505',
  studioBlurb: 'Solo developer. One game at a time.',

  links: {
    // Live.
    youtube: 'https://www.youtube.com/@devisv505',
    discord: 'https://discord.gg/q9T9UcjAZv',
    steam:   'https://store.steampowered.com/app/5027510/Tail_Recursion/',

    // Fill this in when it exists.
    github:  null,   // optional: link to the game repo if you make it public
  },

  steam: {
    // The app id Steamworks issued. Recorded here so the store link and the
    // leaderboard job cannot drift apart; the job itself reads the id from the
    // STEAM_APP_ID repository variable, not from this file.
    appId: 5027510,

    // Where the GitHub Action writes its snapshot. Relative so the site works
    // from a project page (user.github.io/repo/) as well as a root domain.
    leaderboardData: 'data/leaderboard.json',
  },

  // Drop your PNGs into assets/screenshots/ using exactly these names.
  // A missing file degrades to a styled placeholder rather than a broken image.
  screenshots: [
    {
      file: 'title.png',
      title: 'Title',
      caption: 'The menu runs the forager program as attract mode — the snake on the title screen is a real program, not a video.',
    },
    {
      file: 'level-select.png',
      title: 'Puzzles',
      caption: 'One hundred hand-authored puzzles, all shipped. Solving one auto-saves the winning program.',
    },
    {
      file: 'straight-shot.png',
      title: 'Straight Shot',
      caption: 'Level one. One block, wired once. Start wired to Move Forward is the whole program.',
    },
    {
      file: 'zigzag.png',
      title: 'Zigzag',
      caption: 'Repeat N Times counts in its own private state, so a loop body wires back to its own Repeat.',
    },
    {
      file: 'perimeter.png',
      title: 'Perimeter',
      caption: 'Wall Ahead? yes to Turn Right, no to Move Forward. Three blocks that walk any room.',
    },
    {
      file: 'inspector.png',
      title: 'Free play',
      caption: 'The whole layout on macOS: block list left, canvas below, and the inspector on the right showing tick, ops, the exec path and every register while the program runs.',
    },
  ],

  // Mirrors the game's own title-screen menu.
  menu: ['FREE PLAY', 'TUTORIALS', 'PUZZLES', 'SETTINGS', 'EXIT'],
};
