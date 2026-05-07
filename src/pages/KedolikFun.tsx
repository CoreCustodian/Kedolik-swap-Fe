import KedolikPlaceholderPage from '../components/kedolik/KedolikPlaceholderPage';

export default function KedolikFun() {
  return (
    <KedolikPlaceholderPage
      badge="KedolFun"
      title="KedolFun"
      description="KedolFun is now routed into a stable branded page for community drops, social quests, and campaign-style launches. The route no longer breaks the UI."
      status="Preview Mode"
      cards={[
        {
          title: 'Community Drops',
          description:
            'Reserve space for meme launches, social incentives, and fast-turn devnet experiments.',
        },
        {
          title: 'Referral Campaigns',
          description:
            'Use this surface later for invite mechanics, waitlists, and community reward funnels.',
        },
        {
          title: 'Quest Layer',
          description:
            'Keep the page live now so future quest and gamified onboarding flows have a proper shell.',
        },
      ]}
    />
  );
}
