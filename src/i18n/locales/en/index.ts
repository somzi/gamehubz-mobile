// Namespace barrel for English. Adding a namespace = add the JSON file, import it
// here and in the matching `es` barrel. Nothing else needs to change: `src/i18n`
// derives the namespace list from the keys of this object.
import auth from './auth.json';
import bracket from './bracket.json';
import common from './common.json';
import home from './home.json';
import hub from './hub.json';
import match from './match.json';
import profile from './profile.json';
import settings from './settings.json';
import social from './social.json';
import socials from './socials.json';
import support from './support.json';
import team from './team.json';
import tournament from './tournament.json';

export default {
    auth,
    bracket,
    common,
    home,
    hub,
    match,
    profile,
    settings,
    social,
    socials,
    support,
    team,
    tournament,
};
