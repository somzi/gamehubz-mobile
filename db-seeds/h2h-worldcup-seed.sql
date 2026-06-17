-- =========================================================================
-- H2HWorldCup — direct DB seed (dirigovan zreb, jednokružni RR + knockout)
--
-- Format: GroupStageWithKnockout (Format=5)
-- 8 grupa (A-E po 5 igrača, F-H po 6), jednokružni round-robin.
-- 43 učesnika ukupno. 2 qualifiera po grupi → 16 u knockoutu.
-- Knockout (RoundOf16 → QF → SF → Final + 3rdPlace) generiše aplikacija
-- automatski kad svih 95 grupnih mečeva pređe u Completed.
--
-- Vremenski raspored (UTC):
--   StartDate            = 2026-06-17 08:00 UTC  (= 10:00 Belgrade CEST)
--   RegistrationDeadline = 2026-06-17 07:00 UTC  (= 09:00 Belgrade)
--   RoundDuration = 4320 min = 3 dana
--   R1: 17.06 08:00 → 20.06 08:00 UTC
--   R2: 20.06 08:00 → 23.06 08:00 UTC
--   R3: 23.06 08:00 → 26.06 08:00 UTC
--   R4: 26.06 08:00 → 29.06 08:00 UTC
--   R5: 29.06 08:00 → 02.07 08:00 UTC
--
-- Round-robin algoritam (circle method):
--   Grupe od 5 (A-E): jedan igrač ima BYE po rundi (nema kreiran meč za njega).
--     R1: P2-P5, P3-P4         (bye P1)
--     R2: P1-P5, P2-P3         (bye P4)
--     R3: P1-P4, P5-P3         (bye P2)
--     R4: P1-P3, P4-P2         (bye P5)
--     R5: P1-P2, P4-P5         (bye P3)
--   Grupe od 6 (F-H):
--     R1: P1-P6, P2-P5, P3-P4
--     R2: P1-P5, P6-P4, P2-P3
--     R3: P1-P4, P5-P3, P6-P2
--     R4: P1-P3, P4-P2, P5-P6
--     R5: P1-P2, P3-P6, P4-P5
--
-- Broj mečeva:
--   5 grupa × 10 (5 igrača) = 50
--   3 grupe × 15 (6 igrača) = 45
--   TOTAL = 95
--
-- NAPOMENA: CreatedBy MORA biti postavljen (TournamentRepository.GetOverview
-- radi x.CreatedBy!.Value — ako je NULL, "Nullable object must have a value").
-- =========================================================================

BEGIN;

DO $$
DECLARE
  -- ===== Konfiguracija =====
  v_HubId                 uuid := '019e7d63-5cc7-7339-ae47-22b3b71914b3';
  v_CreatorId             uuid := '019e7d62-62e0-74ae-9d31-9f928d8b8a53';
  v_StartDate             timestamp := '2026-06-17 08:00:00';  -- UTC (= 10:00 Belgrade CEST)
  v_RegDeadline           timestamp := '2026-06-17 07:00:00';  -- UTC (= 09:00 Belgrade)
  v_RoundDurationMinutes  int := 4320;                          -- 3 dana
  v_Now                   timestamp := (now() AT TIME ZONE 'UTC');

  -- ===== Generisani GUID-ovi =====
  v_TournamentId    uuid := gen_random_uuid();
  v_GroupStageId    uuid := gen_random_uuid();
  v_KnockoutStageId uuid := gen_random_uuid();
  v_GroupA uuid := gen_random_uuid();
  v_GroupB uuid := gen_random_uuid();
  v_GroupC uuid := gen_random_uuid();
  v_GroupD uuid := gen_random_uuid();
  v_GroupE uuid := gen_random_uuid();
  v_GroupF uuid := gen_random_uuid();
  v_GroupG uuid := gen_random_uuid();
  v_GroupH uuid := gen_random_uuid();

  -- ===== Participant ID-jevi (43) =====
  v_PA1 uuid := gen_random_uuid();  v_PA2 uuid := gen_random_uuid();  v_PA3 uuid := gen_random_uuid();
  v_PA4 uuid := gen_random_uuid();  v_PA5 uuid := gen_random_uuid();
  v_PB1 uuid := gen_random_uuid();  v_PB2 uuid := gen_random_uuid();  v_PB3 uuid := gen_random_uuid();
  v_PB4 uuid := gen_random_uuid();  v_PB5 uuid := gen_random_uuid();
  v_PC1 uuid := gen_random_uuid();  v_PC2 uuid := gen_random_uuid();  v_PC3 uuid := gen_random_uuid();
  v_PC4 uuid := gen_random_uuid();  v_PC5 uuid := gen_random_uuid();
  v_PD1 uuid := gen_random_uuid();  v_PD2 uuid := gen_random_uuid();  v_PD3 uuid := gen_random_uuid();
  v_PD4 uuid := gen_random_uuid();  v_PD5 uuid := gen_random_uuid();
  v_PE1 uuid := gen_random_uuid();  v_PE2 uuid := gen_random_uuid();  v_PE3 uuid := gen_random_uuid();
  v_PE4 uuid := gen_random_uuid();  v_PE5 uuid := gen_random_uuid();
  v_PF1 uuid := gen_random_uuid();  v_PF2 uuid := gen_random_uuid();  v_PF3 uuid := gen_random_uuid();
  v_PF4 uuid := gen_random_uuid();  v_PF5 uuid := gen_random_uuid();  v_PF6 uuid := gen_random_uuid();
  v_PG1 uuid := gen_random_uuid();  v_PG2 uuid := gen_random_uuid();  v_PG3 uuid := gen_random_uuid();
  v_PG4 uuid := gen_random_uuid();  v_PG5 uuid := gen_random_uuid();  v_PG6 uuid := gen_random_uuid();
  v_PH1 uuid := gen_random_uuid();  v_PH2 uuid := gen_random_uuid();  v_PH3 uuid := gen_random_uuid();
  v_PH4 uuid := gen_random_uuid();  v_PH5 uuid := gen_random_uuid();  v_PH6 uuid := gen_random_uuid();

  -- ===== User ID-jevi =====
  -- Group A
  v_UA1 uuid := '019e6580-d7f7-7fb2-90a9-1ee718b8408c';  -- KarolYT
  v_UA2 uuid := '019e8335-b0fc-75ab-a72f-1055aabace67';  -- Dawidpros88
  v_UA3 uuid := '019ec08a-0c80-7155-9a4c-ce8e7a5fb0cf';  -- PPL•SiemaZbychu
  v_UA4 uuid := '019e81f6-8e48-7ad7-8aca-2754075339ad';  -- TorcikXD
  v_UA5 uuid := '019e7edd-b3af-7175-a078-b11901ac86d8';  -- Chelsea
  -- Group B
  v_UB1 uuid := '019dd505-c7bb-7f2f-89e0-548318c74a8c';  -- KARTI
  v_UB2 uuid := '019e7e93-4dde-7054-8c85-ea74c84f8e23';  -- Lunatyk78
  v_UB3 uuid := '019ecb65-6e19-7dfc-a867-4d253c9f05ac';  -- ＮＧØＵＬＡＸ
  v_UB4 uuid := '019e83e4-b3d3-7061-90a1-b50b44558306';  -- SfgW
  v_UB5 uuid := '019e7ee3-ee5c-722d-b1d4-57ed93816627';  -- Arek944
  -- Group C
  v_UC1 uuid := '019e7f8f-6905-7e39-bc89-0f059f8534c8';  -- LunarStarsCity
  v_UC2 uuid := '019dedd8-9f2c-7a2f-be95-f8bac0f35087';  -- Bârtlômiêj
  v_UC3 uuid := '019e7e8e-716a-73dd-8ba7-e22362244a2c';  -- VPL•Deton
  v_UC4 uuid := '019e7ec5-56d0-75ed-a939-b390074425d1';  -- JuMPeR
  v_UC5 uuid := '019ebd2e-5dfb-70c7-abe0-f5a9ecc021c1';  -- maksiu6888
  -- Group D
  v_UD1 uuid := '019e7ec2-462b-749b-bd37-30037ac44e00';  -- jabeacuk
  v_UD2 uuid := '019ed1be-85ae-7cfa-a840-ecf46c71246d';  -- ValverdeGOAT
  v_UD3 uuid := '019e7f8d-11c4-7164-bbbc-463ac5aee076';  -- Sylwanas
  v_UD4 uuid := '019ed1a1-2c7b-7cc1-a793-1ba55b5f51e9';  -- iCantStopWinning
  v_UD5 uuid := '019ecf64-9f11-79fe-9ec0-898d4bc79389';  -- Pierożek9
  -- Group E
  v_UE1 uuid := '019e7f6a-129a-79f3-97e6-ca0a887aefcf';  -- Graba
  v_UE2 uuid := '019ecf9e-a828-7666-af60-5167c09281c3';  -- Matiati
  v_UE3 uuid := '019ecbf4-acda-7c94-af88-338da1bb63d1';  -- Damian
  v_UE4 uuid := '019e7e8a-907c-7f1b-bb4f-572d98703840';  -- PPL•KrK
  v_UE5 uuid := '019e7e82-f1fe-7b15-9965-d6339d12cea8';  -- VPL•Psychol
  -- Group F
  v_UF1 uuid := '019e8305-5af1-7056-bc7f-92f130cc3c16';  -- Danonek
  v_UF2 uuid := '019e7ea9-cebe-72b2-90d4-6dded8380653';  -- Nieśmiały
  v_UF3 uuid := '019e6459-2d27-7b18-bca9-9daa30971457';  -- Camil
  v_UF4 uuid := '019e6d48-89c7-79ce-8d34-976e5e4236f6';  -- Kiritus
  v_UF5 uuid := '019e6578-3960-739e-a4a4-c834823c96b0';  -- SÊÑTRY
  v_UF6 uuid := '019e7e81-f1d6-7824-80a9-b70df5ca1aa4';  -- Xardo
  -- Group G
  v_UG1 uuid := '019e82cd-9c90-7c28-bf9f-bd2b4574f158';  -- Morpheus
  v_UG2 uuid := '019e7f8e-c04b-7985-942f-782e47e617c3';  -- Grejpfrutowy
  v_UG3 uuid := '019e7fac-23fd-70ce-bf8d-f87297a77358';  -- Łysyy1990
  v_UG4 uuid := '019ecf7e-8e18-77c8-aa1e-bc505fddc768';  -- PPL•VØIDBØRN
  v_UG5 uuid := '019e7e85-e072-74c1-a7d0-815bfc5225c7';  -- VPL•Sebek
  v_UG6 uuid := '019e6599-ee62-7db2-ab8a-7e0f55198317';  -- StormShadow
  -- Group H
  v_UH1 uuid := '019dd509-592d-7345-924a-8d94f8ee7bbf';  -- nēymarekdgâf
  v_UH2 uuid := '019e7ef2-5316-78c6-9c4a-0736b9d89f00';  -- Asik
  v_UH3 uuid := '019e7fbf-c566-77f1-8376-80729b2acecc';  -- BARTIX
  v_UH4 uuid := '019e7e82-0f7a-7019-a0b7-8aaae016fc8c';  -- Bäbå•Yägå
  v_UH5 uuid := '019e7e96-1aa8-7a28-bb87-cb60f9cdc787';  -- MoNk
  v_UH6 uuid := '019ed150-c7ff-7ce8-9699-002be11d0be0';  -- PogromcyZPieklaa

  -- ===== Round open/deadline timestamps =====
  v_R1Open timestamp;  v_R1Dead timestamp;
  v_R2Open timestamp;  v_R2Dead timestamp;
  v_R3Open timestamp;  v_R3Dead timestamp;
  v_R4Open timestamp;  v_R4Dead timestamp;
  v_R5Open timestamp;  v_R5Dead timestamp;

BEGIN
  v_R1Open := v_StartDate;                      v_R1Dead := v_StartDate + interval '3 days';
  v_R2Open := v_StartDate + interval '3 days';  v_R2Dead := v_StartDate + interval '6 days';
  v_R3Open := v_StartDate + interval '6 days';  v_R3Dead := v_StartDate + interval '9 days';
  v_R4Open := v_StartDate + interval '9 days';  v_R4Dead := v_StartDate + interval '12 days';
  v_R5Open := v_StartDate + interval '12 days'; v_R5Dead := v_StartDate + interval '15 days';

  -- ============================================================
  -- 1) Tournament
  -- ============================================================
  INSERT INTO "Tournament" (
    "Id", "CreatedOn", "ModifiedOn", "IsDeleted", "CreatedBy", "ModifiedBy",
    "HubId", "Name", "Description", "Rules",
    "Status", "MaxPlayers", "StartDate", "RegistrationDeadline",
    "Format", "Prize", "PrizeCurrency", "Region",
    "GroupsCount", "QualifiersPerGroup", "RoundDurationMinutes",
    "IsTeamTournament", "TeamWinCondition",
    "HasThirdPlaceMatch", "RequireResultApproval"
  ) VALUES (
    v_TournamentId, v_Now, v_Now, false, v_CreatorId, v_CreatorId,
    v_HubId, 'H2HWorldCup', 'description', 'Rules',
    3, 43, v_StartDate, v_RegDeadline,           -- Status InProgress=3
    5, 0, 1, 0,                                   -- Format=5, Prize=0, Currency=EUR(1), Region=GLOBAL(0)
    8, 2, v_RoundDurationMinutes,                 -- 8 grupa, 2 qualifiera/grupa
    false, 0,                                     -- Solo turnir
    true, true                                    -- 3.mjesto: DA, approval: DA
  );

  -- ============================================================
  -- 2) Tournament Stages
  -- ============================================================
  INSERT INTO "TournamentStage" (
    "Id", "CreatedOn", "ModifiedOn", "IsDeleted", "CreatedBy", "ModifiedBy",
    "Type", "Order", "QualifiedPlayersCount", "TournamentId", "Name"
  ) VALUES
    (v_GroupStageId,    v_Now, v_Now, false, v_CreatorId, v_CreatorId, 1, 1, 2,  v_TournamentId, 'Group Stage'),     -- GroupStage=1, 2 prolaze po grupi
    (v_KnockoutStageId, v_Now, v_Now, false, v_CreatorId, v_CreatorId, 3, 2, 16, v_TournamentId, 'Knockout Stage');  -- SingleElim=3, 16 u knockoutu

  -- ============================================================
  -- 3) Tournament Groups
  -- ============================================================
  INSERT INTO "TournamentGroup" (
    "Id", "CreatedOn", "ModifiedOn", "IsDeleted", "CreatedBy", "ModifiedBy",
    "Name", "TournamentStageId"
  ) VALUES
    (v_GroupA, v_Now, v_Now, false, v_CreatorId, v_CreatorId, 'Group A', v_GroupStageId),
    (v_GroupB, v_Now, v_Now, false, v_CreatorId, v_CreatorId, 'Group B', v_GroupStageId),
    (v_GroupC, v_Now, v_Now, false, v_CreatorId, v_CreatorId, 'Group C', v_GroupStageId),
    (v_GroupD, v_Now, v_Now, false, v_CreatorId, v_CreatorId, 'Group D', v_GroupStageId),
    (v_GroupE, v_Now, v_Now, false, v_CreatorId, v_CreatorId, 'Group E', v_GroupStageId),
    (v_GroupF, v_Now, v_Now, false, v_CreatorId, v_CreatorId, 'Group F', v_GroupStageId),
    (v_GroupG, v_Now, v_Now, false, v_CreatorId, v_CreatorId, 'Group G', v_GroupStageId),
    (v_GroupH, v_Now, v_Now, false, v_CreatorId, v_CreatorId, 'Group H', v_GroupStageId);

  -- ============================================================
  -- 4) Tournament Participants (43)
  -- ============================================================
  INSERT INTO "TournamentParticipant" (
    "Id", "CreatedOn", "ModifiedOn", "IsDeleted", "CreatedBy", "ModifiedBy",
    "TournamentId", "UserId", "Seed", "GroupPosition",
    "Points", "Wins", "Losses", "Draws", "GoalsFor", "GoalsAgainst",
    "TournamentGroupId"
  ) VALUES
    -- Group A (5)
    (v_PA1, v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, v_UA1, 1,  1, 0,0,0,0,0,0, v_GroupA),
    (v_PA2, v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, v_UA2, 2,  2, 0,0,0,0,0,0, v_GroupA),
    (v_PA3, v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, v_UA3, 3,  3, 0,0,0,0,0,0, v_GroupA),
    (v_PA4, v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, v_UA4, 4,  4, 0,0,0,0,0,0, v_GroupA),
    (v_PA5, v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, v_UA5, 5,  5, 0,0,0,0,0,0, v_GroupA),
    -- Group B (5)
    (v_PB1, v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, v_UB1, 6,  1, 0,0,0,0,0,0, v_GroupB),
    (v_PB2, v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, v_UB2, 7,  2, 0,0,0,0,0,0, v_GroupB),
    (v_PB3, v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, v_UB3, 8,  3, 0,0,0,0,0,0, v_GroupB),
    (v_PB4, v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, v_UB4, 9,  4, 0,0,0,0,0,0, v_GroupB),
    (v_PB5, v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, v_UB5, 10, 5, 0,0,0,0,0,0, v_GroupB),
    -- Group C (5)
    (v_PC1, v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, v_UC1, 11, 1, 0,0,0,0,0,0, v_GroupC),
    (v_PC2, v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, v_UC2, 12, 2, 0,0,0,0,0,0, v_GroupC),
    (v_PC3, v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, v_UC3, 13, 3, 0,0,0,0,0,0, v_GroupC),
    (v_PC4, v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, v_UC4, 14, 4, 0,0,0,0,0,0, v_GroupC),
    (v_PC5, v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, v_UC5, 15, 5, 0,0,0,0,0,0, v_GroupC),
    -- Group D (5)
    (v_PD1, v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, v_UD1, 16, 1, 0,0,0,0,0,0, v_GroupD),
    (v_PD2, v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, v_UD2, 17, 2, 0,0,0,0,0,0, v_GroupD),
    (v_PD3, v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, v_UD3, 18, 3, 0,0,0,0,0,0, v_GroupD),
    (v_PD4, v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, v_UD4, 19, 4, 0,0,0,0,0,0, v_GroupD),
    (v_PD5, v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, v_UD5, 20, 5, 0,0,0,0,0,0, v_GroupD),
    -- Group E (5)
    (v_PE1, v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, v_UE1, 21, 1, 0,0,0,0,0,0, v_GroupE),
    (v_PE2, v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, v_UE2, 22, 2, 0,0,0,0,0,0, v_GroupE),
    (v_PE3, v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, v_UE3, 23, 3, 0,0,0,0,0,0, v_GroupE),
    (v_PE4, v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, v_UE4, 24, 4, 0,0,0,0,0,0, v_GroupE),
    (v_PE5, v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, v_UE5, 25, 5, 0,0,0,0,0,0, v_GroupE),
    -- Group F (6)
    (v_PF1, v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, v_UF1, 26, 1, 0,0,0,0,0,0, v_GroupF),
    (v_PF2, v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, v_UF2, 27, 2, 0,0,0,0,0,0, v_GroupF),
    (v_PF3, v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, v_UF3, 28, 3, 0,0,0,0,0,0, v_GroupF),
    (v_PF4, v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, v_UF4, 29, 4, 0,0,0,0,0,0, v_GroupF),
    (v_PF5, v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, v_UF5, 30, 5, 0,0,0,0,0,0, v_GroupF),
    (v_PF6, v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, v_UF6, 31, 6, 0,0,0,0,0,0, v_GroupF),
    -- Group G (6)
    (v_PG1, v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, v_UG1, 32, 1, 0,0,0,0,0,0, v_GroupG),
    (v_PG2, v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, v_UG2, 33, 2, 0,0,0,0,0,0, v_GroupG),
    (v_PG3, v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, v_UG3, 34, 3, 0,0,0,0,0,0, v_GroupG),
    (v_PG4, v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, v_UG4, 35, 4, 0,0,0,0,0,0, v_GroupG),
    (v_PG5, v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, v_UG5, 36, 5, 0,0,0,0,0,0, v_GroupG),
    (v_PG6, v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, v_UG6, 37, 6, 0,0,0,0,0,0, v_GroupG),
    -- Group H (6)
    (v_PH1, v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, v_UH1, 38, 1, 0,0,0,0,0,0, v_GroupH),
    (v_PH2, v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, v_UH2, 39, 2, 0,0,0,0,0,0, v_GroupH),
    (v_PH3, v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, v_UH3, 40, 3, 0,0,0,0,0,0, v_GroupH),
    (v_PH4, v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, v_UH4, 41, 4, 0,0,0,0,0,0, v_GroupH),
    (v_PH5, v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, v_UH5, 42, 5, 0,0,0,0,0,0, v_GroupH),
    (v_PH6, v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, v_UH6, 43, 6, 0,0,0,0,0,0, v_GroupH);

  -- ============================================================
  -- 5) Group Stage Matches (95)
  --     Status=1 (Pending), Stage=1 (GroupStage), IsUpperBracket=true
  -- ============================================================
  INSERT INTO "Match" (
    "Id", "CreatedOn", "ModifiedOn", "IsDeleted", "CreatedBy", "ModifiedBy",
    "TournamentId", "RoundNumber",
    "HomeParticipantId", "AwayParticipantId",
    "Status", "TournamentStageId", "Stage", "TournamentGroupId",
    "MatchOrder", "IsUpperBracket",
    "RoundDeadline", "RoundOpenAt"
  ) VALUES
    -- ====== GROUP A (5 igrača — 10 mečeva) ======
    -- R1 (bye P1)
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 1, v_PA2, v_PA5, 1, v_GroupStageId, 1, v_GroupA, 0, true, v_R1Dead, v_R1Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 1, v_PA3, v_PA4, 1, v_GroupStageId, 1, v_GroupA, 1, true, v_R1Dead, v_R1Open),
    -- R2 (bye P4)
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 2, v_PA1, v_PA5, 1, v_GroupStageId, 1, v_GroupA, 0, true, v_R2Dead, v_R2Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 2, v_PA2, v_PA3, 1, v_GroupStageId, 1, v_GroupA, 1, true, v_R2Dead, v_R2Open),
    -- R3 (bye P2)
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 3, v_PA1, v_PA4, 1, v_GroupStageId, 1, v_GroupA, 0, true, v_R3Dead, v_R3Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 3, v_PA5, v_PA3, 1, v_GroupStageId, 1, v_GroupA, 1, true, v_R3Dead, v_R3Open),
    -- R4 (bye P5)
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 4, v_PA1, v_PA3, 1, v_GroupStageId, 1, v_GroupA, 0, true, v_R4Dead, v_R4Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 4, v_PA4, v_PA2, 1, v_GroupStageId, 1, v_GroupA, 1, true, v_R4Dead, v_R4Open),
    -- R5 (bye P3)
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 5, v_PA1, v_PA2, 1, v_GroupStageId, 1, v_GroupA, 0, true, v_R5Dead, v_R5Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 5, v_PA4, v_PA5, 1, v_GroupStageId, 1, v_GroupA, 1, true, v_R5Dead, v_R5Open),

    -- ====== GROUP B (5) ======
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 1, v_PB2, v_PB5, 1, v_GroupStageId, 1, v_GroupB, 0, true, v_R1Dead, v_R1Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 1, v_PB3, v_PB4, 1, v_GroupStageId, 1, v_GroupB, 1, true, v_R1Dead, v_R1Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 2, v_PB1, v_PB5, 1, v_GroupStageId, 1, v_GroupB, 0, true, v_R2Dead, v_R2Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 2, v_PB2, v_PB3, 1, v_GroupStageId, 1, v_GroupB, 1, true, v_R2Dead, v_R2Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 3, v_PB1, v_PB4, 1, v_GroupStageId, 1, v_GroupB, 0, true, v_R3Dead, v_R3Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 3, v_PB5, v_PB3, 1, v_GroupStageId, 1, v_GroupB, 1, true, v_R3Dead, v_R3Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 4, v_PB1, v_PB3, 1, v_GroupStageId, 1, v_GroupB, 0, true, v_R4Dead, v_R4Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 4, v_PB4, v_PB2, 1, v_GroupStageId, 1, v_GroupB, 1, true, v_R4Dead, v_R4Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 5, v_PB1, v_PB2, 1, v_GroupStageId, 1, v_GroupB, 0, true, v_R5Dead, v_R5Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 5, v_PB4, v_PB5, 1, v_GroupStageId, 1, v_GroupB, 1, true, v_R5Dead, v_R5Open),

    -- ====== GROUP C (5) ======
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 1, v_PC2, v_PC5, 1, v_GroupStageId, 1, v_GroupC, 0, true, v_R1Dead, v_R1Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 1, v_PC3, v_PC4, 1, v_GroupStageId, 1, v_GroupC, 1, true, v_R1Dead, v_R1Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 2, v_PC1, v_PC5, 1, v_GroupStageId, 1, v_GroupC, 0, true, v_R2Dead, v_R2Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 2, v_PC2, v_PC3, 1, v_GroupStageId, 1, v_GroupC, 1, true, v_R2Dead, v_R2Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 3, v_PC1, v_PC4, 1, v_GroupStageId, 1, v_GroupC, 0, true, v_R3Dead, v_R3Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 3, v_PC5, v_PC3, 1, v_GroupStageId, 1, v_GroupC, 1, true, v_R3Dead, v_R3Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 4, v_PC1, v_PC3, 1, v_GroupStageId, 1, v_GroupC, 0, true, v_R4Dead, v_R4Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 4, v_PC4, v_PC2, 1, v_GroupStageId, 1, v_GroupC, 1, true, v_R4Dead, v_R4Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 5, v_PC1, v_PC2, 1, v_GroupStageId, 1, v_GroupC, 0, true, v_R5Dead, v_R5Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 5, v_PC4, v_PC5, 1, v_GroupStageId, 1, v_GroupC, 1, true, v_R5Dead, v_R5Open),

    -- ====== GROUP D (5) ======
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 1, v_PD2, v_PD5, 1, v_GroupStageId, 1, v_GroupD, 0, true, v_R1Dead, v_R1Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 1, v_PD3, v_PD4, 1, v_GroupStageId, 1, v_GroupD, 1, true, v_R1Dead, v_R1Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 2, v_PD1, v_PD5, 1, v_GroupStageId, 1, v_GroupD, 0, true, v_R2Dead, v_R2Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 2, v_PD2, v_PD3, 1, v_GroupStageId, 1, v_GroupD, 1, true, v_R2Dead, v_R2Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 3, v_PD1, v_PD4, 1, v_GroupStageId, 1, v_GroupD, 0, true, v_R3Dead, v_R3Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 3, v_PD5, v_PD3, 1, v_GroupStageId, 1, v_GroupD, 1, true, v_R3Dead, v_R3Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 4, v_PD1, v_PD3, 1, v_GroupStageId, 1, v_GroupD, 0, true, v_R4Dead, v_R4Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 4, v_PD4, v_PD2, 1, v_GroupStageId, 1, v_GroupD, 1, true, v_R4Dead, v_R4Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 5, v_PD1, v_PD2, 1, v_GroupStageId, 1, v_GroupD, 0, true, v_R5Dead, v_R5Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 5, v_PD4, v_PD5, 1, v_GroupStageId, 1, v_GroupD, 1, true, v_R5Dead, v_R5Open),

    -- ====== GROUP E (5) ======
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 1, v_PE2, v_PE5, 1, v_GroupStageId, 1, v_GroupE, 0, true, v_R1Dead, v_R1Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 1, v_PE3, v_PE4, 1, v_GroupStageId, 1, v_GroupE, 1, true, v_R1Dead, v_R1Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 2, v_PE1, v_PE5, 1, v_GroupStageId, 1, v_GroupE, 0, true, v_R2Dead, v_R2Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 2, v_PE2, v_PE3, 1, v_GroupStageId, 1, v_GroupE, 1, true, v_R2Dead, v_R2Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 3, v_PE1, v_PE4, 1, v_GroupStageId, 1, v_GroupE, 0, true, v_R3Dead, v_R3Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 3, v_PE5, v_PE3, 1, v_GroupStageId, 1, v_GroupE, 1, true, v_R3Dead, v_R3Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 4, v_PE1, v_PE3, 1, v_GroupStageId, 1, v_GroupE, 0, true, v_R4Dead, v_R4Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 4, v_PE4, v_PE2, 1, v_GroupStageId, 1, v_GroupE, 1, true, v_R4Dead, v_R4Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 5, v_PE1, v_PE2, 1, v_GroupStageId, 1, v_GroupE, 0, true, v_R5Dead, v_R5Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 5, v_PE4, v_PE5, 1, v_GroupStageId, 1, v_GroupE, 1, true, v_R5Dead, v_R5Open),

    -- ====== GROUP F (6 igrača — 15 mečeva) ======
    -- R1: P1-P6, P2-P5, P3-P4
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 1, v_PF1, v_PF6, 1, v_GroupStageId, 1, v_GroupF, 0, true, v_R1Dead, v_R1Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 1, v_PF2, v_PF5, 1, v_GroupStageId, 1, v_GroupF, 1, true, v_R1Dead, v_R1Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 1, v_PF3, v_PF4, 1, v_GroupStageId, 1, v_GroupF, 2, true, v_R1Dead, v_R1Open),
    -- R2: P1-P5, P6-P4, P2-P3
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 2, v_PF1, v_PF5, 1, v_GroupStageId, 1, v_GroupF, 0, true, v_R2Dead, v_R2Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 2, v_PF6, v_PF4, 1, v_GroupStageId, 1, v_GroupF, 1, true, v_R2Dead, v_R2Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 2, v_PF2, v_PF3, 1, v_GroupStageId, 1, v_GroupF, 2, true, v_R2Dead, v_R2Open),
    -- R3: P1-P4, P5-P3, P6-P2
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 3, v_PF1, v_PF4, 1, v_GroupStageId, 1, v_GroupF, 0, true, v_R3Dead, v_R3Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 3, v_PF5, v_PF3, 1, v_GroupStageId, 1, v_GroupF, 1, true, v_R3Dead, v_R3Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 3, v_PF6, v_PF2, 1, v_GroupStageId, 1, v_GroupF, 2, true, v_R3Dead, v_R3Open),
    -- R4: P1-P3, P4-P2, P5-P6
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 4, v_PF1, v_PF3, 1, v_GroupStageId, 1, v_GroupF, 0, true, v_R4Dead, v_R4Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 4, v_PF4, v_PF2, 1, v_GroupStageId, 1, v_GroupF, 1, true, v_R4Dead, v_R4Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 4, v_PF5, v_PF6, 1, v_GroupStageId, 1, v_GroupF, 2, true, v_R4Dead, v_R4Open),
    -- R5: P1-P2, P3-P6, P4-P5
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 5, v_PF1, v_PF2, 1, v_GroupStageId, 1, v_GroupF, 0, true, v_R5Dead, v_R5Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 5, v_PF3, v_PF6, 1, v_GroupStageId, 1, v_GroupF, 1, true, v_R5Dead, v_R5Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 5, v_PF4, v_PF5, 1, v_GroupStageId, 1, v_GroupF, 2, true, v_R5Dead, v_R5Open),

    -- ====== GROUP G (6) ======
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 1, v_PG1, v_PG6, 1, v_GroupStageId, 1, v_GroupG, 0, true, v_R1Dead, v_R1Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 1, v_PG2, v_PG5, 1, v_GroupStageId, 1, v_GroupG, 1, true, v_R1Dead, v_R1Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 1, v_PG3, v_PG4, 1, v_GroupStageId, 1, v_GroupG, 2, true, v_R1Dead, v_R1Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 2, v_PG1, v_PG5, 1, v_GroupStageId, 1, v_GroupG, 0, true, v_R2Dead, v_R2Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 2, v_PG6, v_PG4, 1, v_GroupStageId, 1, v_GroupG, 1, true, v_R2Dead, v_R2Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 2, v_PG2, v_PG3, 1, v_GroupStageId, 1, v_GroupG, 2, true, v_R2Dead, v_R2Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 3, v_PG1, v_PG4, 1, v_GroupStageId, 1, v_GroupG, 0, true, v_R3Dead, v_R3Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 3, v_PG5, v_PG3, 1, v_GroupStageId, 1, v_GroupG, 1, true, v_R3Dead, v_R3Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 3, v_PG6, v_PG2, 1, v_GroupStageId, 1, v_GroupG, 2, true, v_R3Dead, v_R3Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 4, v_PG1, v_PG3, 1, v_GroupStageId, 1, v_GroupG, 0, true, v_R4Dead, v_R4Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 4, v_PG4, v_PG2, 1, v_GroupStageId, 1, v_GroupG, 1, true, v_R4Dead, v_R4Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 4, v_PG5, v_PG6, 1, v_GroupStageId, 1, v_GroupG, 2, true, v_R4Dead, v_R4Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 5, v_PG1, v_PG2, 1, v_GroupStageId, 1, v_GroupG, 0, true, v_R5Dead, v_R5Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 5, v_PG3, v_PG6, 1, v_GroupStageId, 1, v_GroupG, 1, true, v_R5Dead, v_R5Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 5, v_PG4, v_PG5, 1, v_GroupStageId, 1, v_GroupG, 2, true, v_R5Dead, v_R5Open),

    -- ====== GROUP H (6) ======
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 1, v_PH1, v_PH6, 1, v_GroupStageId, 1, v_GroupH, 0, true, v_R1Dead, v_R1Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 1, v_PH2, v_PH5, 1, v_GroupStageId, 1, v_GroupH, 1, true, v_R1Dead, v_R1Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 1, v_PH3, v_PH4, 1, v_GroupStageId, 1, v_GroupH, 2, true, v_R1Dead, v_R1Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 2, v_PH1, v_PH5, 1, v_GroupStageId, 1, v_GroupH, 0, true, v_R2Dead, v_R2Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 2, v_PH6, v_PH4, 1, v_GroupStageId, 1, v_GroupH, 1, true, v_R2Dead, v_R2Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 2, v_PH2, v_PH3, 1, v_GroupStageId, 1, v_GroupH, 2, true, v_R2Dead, v_R2Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 3, v_PH1, v_PH4, 1, v_GroupStageId, 1, v_GroupH, 0, true, v_R3Dead, v_R3Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 3, v_PH5, v_PH3, 1, v_GroupStageId, 1, v_GroupH, 1, true, v_R3Dead, v_R3Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 3, v_PH6, v_PH2, 1, v_GroupStageId, 1, v_GroupH, 2, true, v_R3Dead, v_R3Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 4, v_PH1, v_PH3, 1, v_GroupStageId, 1, v_GroupH, 0, true, v_R4Dead, v_R4Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 4, v_PH4, v_PH2, 1, v_GroupStageId, 1, v_GroupH, 1, true, v_R4Dead, v_R4Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 4, v_PH5, v_PH6, 1, v_GroupStageId, 1, v_GroupH, 2, true, v_R4Dead, v_R4Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 5, v_PH1, v_PH2, 1, v_GroupStageId, 1, v_GroupH, 0, true, v_R5Dead, v_R5Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 5, v_PH3, v_PH6, 1, v_GroupStageId, 1, v_GroupH, 1, true, v_R5Dead, v_R5Open),
    (gen_random_uuid(), v_Now, v_Now, false, v_CreatorId, v_CreatorId, v_TournamentId, 5, v_PH4, v_PH5, 1, v_GroupStageId, 1, v_GroupH, 2, true, v_R5Dead, v_R5Open);

  RAISE NOTICE 'Tournament created: %', v_TournamentId;
  RAISE NOTICE 'GroupStageId: %  KnockoutStageId: %', v_GroupStageId, v_KnockoutStageId;
  RAISE NOTICE 'Groups: A=% B=% C=% D=% E=% F=% G=% H=%',
    v_GroupA, v_GroupB, v_GroupC, v_GroupD, v_GroupE, v_GroupF, v_GroupG, v_GroupH;
  RAISE NOTICE 'CreatedBy: % (Owner)', v_CreatorId;
END $$;

-- Provjeri prije COMMIT-a:
-- SELECT * FROM "Tournament" WHERE "Name" = 'H2HWorldCup';
-- SELECT COUNT(*) FROM "Match"
--   WHERE "TournamentId" = (SELECT "Id" FROM "Tournament" WHERE "Name" = 'H2HWorldCup');
-- -- treba da bude 95
-- SELECT COUNT(*) FROM "TournamentParticipant"
--   WHERE "TournamentId" = (SELECT "Id" FROM "Tournament" WHERE "Name" = 'H2HWorldCup');
-- -- treba da bude 43

COMMIT;
