// Team Tournament Labels
export const TEAM_LABELS = {
    // Mode Toggle
    MODE_SOLO: 'Solo',
    MODE_TEAM: 'Team',
    MODE_LABEL: 'Tournament Mode',

    // Team Size
    TEAM_SIZE_LABEL: 'Players per Team',
    TEAM_SIZE_PLACEHOLDER: 'e.g. 2, 3, 5',

    // Registration Modal
    REGISTRATION_MODAL_TITLE: 'Join Team Tournament',
    TAB_CREATE_TEAM: 'Create a Team',
    TAB_JOIN_TEAM: 'Join a Team',
    TEAM_NAME_LABEL: 'Team Name',
    TEAM_NAME_PLACEHOLDER: 'Enter your team name',
    CREATE_TEAM_BUTTON: 'Create Team',
    JOIN_TEAM_BUTTON: 'Join',
    NO_TEAMS_AVAILABLE: 'No teams available yet. Be the first to create one!',
    TEAM_FULL: 'Full',

    // Team Dashboard
    TEAM_DASHBOARD_TITLE: 'Team Dashboard',
    MEMBERS_LABEL: 'Members',
    CAPTAIN_BADGE: 'Captain',
    LEAVE_TEAM_BUTTON: 'Leave Team',
    REGISTER_TEAM_BUTTON: 'Register Team',
    DELETE_TEAM_BUTTON: 'Delete Team',
    KICK_MEMBER_BUTTON: 'Remove',
    EDIT_TEAM_NAME: 'Edit Team Name',
    MY_TEAM_BUTTON: 'My Team',

    // Confirmation Modals
    CONFIRM_LEAVE_TITLE: 'Leave Team',
    CONFIRM_LEAVE_MESSAGE: 'Are you sure you want to leave this team?',
    CONFIRM_KICK_TITLE: 'Remove Member',
    CONFIRM_KICK_MESSAGE: 'Are you sure you want to remove this member from the team?',
    CONFIRM_DELETE_TITLE: 'Delete Team',
    CONFIRM_DELETE_MESSAGE: 'Are you sure you want to delete this team? This action cannot be undone.',
    CONFIRM_BUTTON: 'Confirm',
    CANCEL_BUTTON: 'Cancel',

    // Team Match Detail Modal
    MATCH_DETAIL_TITLE: 'Team Match Details',
    AGGREGATE_SCORE_LABEL: 'Aggregate Score',
    SUB_MATCHES_LABEL: 'Matches',
    TIE_BREAK_LABEL: 'Tie-Break',
    TIE_BREAK_BANNER: 'Match Tied! A tie-break match is required.',
    TIE_BREAK_IN_PROGRESS: 'Tie-break match in progress',
    SELECT_REPRESENTATIVE: 'Select Your Representative',
    WAITING_FOR_OPPONENT: 'Waiting for opponent captain...',
    WAITING_LABEL: 'Waiting...',
    SUBMIT_SCORE: 'Submit',
    HOME_REPRESENTATIVE: 'Home Representative',
    AWAY_REPRESENTATIVE: 'Away Representative',
    TEAM_WINS: 'wins',
    AWAITING_RESULTS: 'Awaiting results',

    // Tournament Details
    REGISTER_CREATE_JOIN: 'Register Team',
    TEAMS_SECTION_TITLE: 'Teams',
    NO_TEAMS_REGISTERED: 'No teams registered yet.',

    // Errors
    ERROR_CREATE_TEAM: 'Failed to create team',
    ERROR_JOIN_TEAM: 'Failed to join team',
    ERROR_RENAME_TEAM: 'Failed to rename team',
    ERROR_DELETE_TEAM: 'Failed to delete team',
    ERROR_KICK_MEMBER: 'Failed to remove member',
    ERROR_LEAVE_TEAM: 'Failed to leave team',
    ERROR_FETCH_TEAMS: 'Failed to load teams',
    ERROR_SUBMIT_SCORE: 'Failed to submit score',
    ERROR_SUBMIT_REPRESENTATIVE: 'Failed to submit representative',
    ERROR_REGISTER_TEAM: 'Failed to register team',
} as const;
