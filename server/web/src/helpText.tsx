/** The help card texts. Words from SPEC.md §4, §5, §6.1, §6.9. */

export const HELP = {
  committed: (
    <>
      <div><b>Committed dates</b> counts the goals in progress on this list by their health. A Committed date is a promise. Health is judged against it, or against the Promotion Milestone's date.</div>
      <div><b>GREEN</b> On track. The risks are understood and the owner believes the date will be hit.</div>
      <div><b>YELLOW</b> Real unknowns or blockers, with a credible path to the date. This is the time to act.</div>
      <div><b>RED</b> The date is not credible without help, or there is no Path to Green.</div>
      <div>A <b>slip</b> is a Committed date that passed before the goal was met.</div>
      <div>Point at a health to highlight its goals. Click it to show only those goals. Click it again to show all.</div>
    </>
  ),
  drafts: (
    <>
      <div><b>Drafts</b> are changes an agent proposes, for example a new health with its evidence.</div>
      <div>A Draft shows on its goal as soon as the agent makes it. Nothing changes until a human approves it.</div>
      <div>Approving or rejecting a Draft is recorded in the goal's history, with who did it and why.</div>
    </>
  ),
  promotions: (
    <>
      <div><b>Promotions due</b> is the next Promotion Milestone and the days left to it.</div>
      <div>A <b>Promotion Milestone</b> is a goal with a committed date, by which another goal's uncommitted date moves up one Date Type.</div>
      <div><b>Fantasy</b> moves to <b>Ambition</b>, and <b>Ambition</b> moves to <b>Committed</b>. A Committed date needs a Plan at Pencil.</div>
    </>
  ),
  committedDate: <div>A <b>Committed date</b> is a promise. Health is judged against it, or against the Promotion Milestone's date.</div>,
};
