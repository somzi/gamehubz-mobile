export type RootStackParamList = {
    Login: undefined;
    Register: undefined;
    ForgotPassword: undefined;
    ResetPassword: { email: string };
    MainTabs: undefined;
    TournamentDetails: {
        id: string;
        /** Push deep-link: pop the admin help-requests inbox on open. */
        openAdminHelp?: boolean;
        /** Push deep-link: open this match's details modal on open. */
        focusMatchId?: string;
        /** Push deep-link: set when the focused match is a team-tournament sub-match — opens
         *  the team-match modal instead of the solo modal (which renders empty for sub-matches). */
        focusTeamMatchId?: string;
        /** Which tab the deep-linked match modal lands on. Defaults to 'chat'. */
        focusMatchTab?: 'match' | 'chat';
        /** Share deep-link: land on the Teams tab and prompt to join this team. */
        focusTeamId?: string;
        focusTeamName?: string;
        focusTeamRequiresApproval?: boolean;
    };
    HubProfile: { id: string };
    PlayerProfile: { id: string };
    NotFound: undefined;
    EditProfile: undefined;
    ChangePassword: undefined;
    HelpCenter: undefined;
    AboutUs: undefined;
    ContactUs: undefined;
    UpdateProfile: undefined;
    ManageHub: { hubId: string };
    HubMembers: { hubId: string };
    ManageHubSocials: { hubId: string };
    ManageUserSocials: undefined;
    ManageTournament: { id: string };
    MyMatches: undefined;
    TeamDashboard: { teamId: string; tournamentId: string; teamSize?: number; tournamentStatus?: number };
    DirectChat: {
        chatId?: string;
        otherUserId?: string;
        /**
         * Optional header seed from the originating list/profile so the chat screen
         * can render the name/avatar instantly — no round-trip just for the header.
         * Present on chatId entries (chat list). Absent on deep links / push
         * notifications, where the screen falls back to GET /api/DirectChat/{id}.
         */
        header?: {
            otherUserId?: string;
            otherUsername: string;
            otherNickname?: string | null;
            otherAvatarUrl?: string | null;
        };
    };
    /** Share-link landing: resolves the team's tournament, then redirects into it. */
    Team: { teamId: string };
};

export type MainTabParamList = {
    Home: undefined;
    Tournaments: undefined;
    Hubs: undefined;
    Social: { initialTab?: 'friends' | 'requests' | 'chats' } | undefined;
    Profile: undefined;
};
