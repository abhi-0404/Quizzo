# Contributors (reviewers)

A **contributor** is a trusted person you add to double-check a paper after it is published: they confirm each answer in the key, flag the ones that look wrong, and attach worked solutions as a PDF or an image. You (the admin) decide what is accepted. Nothing a contributor does reaches students until you approve it.

## What a contributor can and cannot do

| Can | Cannot |
|---|---|
| Open any **published** paper in the contributor portal | See unpublished papers |
| See the answer key of a published paper | Change a paper, a question or the answer key |
| Mark each answer **correct**, or **wrong** with the answer they think is right and a note | Publish, create or delete papers |
| Upload solutions (PDF, PNG, JPEG or WebP, up to **10 MB** each) for one question or for the whole paper | See other contributors' pending work |
| Edit a review, or delete a solution, **while it is still pending**. Withdraw a **rejected** flag and file it again | Edit or delete anything an admin has accepted or approved |
| See their own history under My submissions | See students' attempts, profiles, analytics or the admin pages |

## Add a contributor

1. Sign in as admin and open **Admin → Contributors**.
2. Type the person's **Google email address** and add them.

Two things can happen, and the page tells you which:

- **They already have an account:** they become a contributor immediately.
- **They have never signed in:** an invitation is saved (valid for 90 days). The moment they first sign in with that Google address, they become a contributor automatically. You do not need to do anything else.

The email must be the one on their Google account. Capital letters do not matter. If you typed the wrong address, revoke the pending invitation on the same page and add the right one.

The person finds their work through the grid icon next to their profile icon in the site header, which opens the **Contributor portal**.

## What the contributor does

1. Open **Papers to review** and pick a paper. The list shows how many questions they have already reviewed.
2. For each question, choose one:
   - **Correct:** the key is right.
   - **Wrong:** pick the option(s) they believe are right (or type the numeric answer), and add a short note explaining why.
3. Optionally attach a **solution** (PDF or image) to a question, or one for the whole paper. Files over 10 MB, or of other types, are refused.
4. Check **My submissions** to see what is pending, accepted, approved or rejected.

A contributor can change a verdict or remove an upload until you decide on it. After that it is locked.

## What you do with their work

Open **Admin → Review Inbox**. It has two lists.

**Flagged answers.** Each item shows the question, the current key, the contributor's suggestion and their note.

- **Accept** applies the contributor's corrected answer to the question. From then on, new attempts are graded against the corrected key.
- **Reject** leaves the key as it is.

> **Past attempts are not re-graded.** Students who already submitted keep the score they were given. If a wrong key affected many people, tell them, or ask for the affected attempts to be re-scored as a separate task.

**Solutions.** Each item shows the file (open it to read it), who sent it, and their note.

- **Approve** makes the solution visible to students: signed-in students see it under **Show Solution** in practice mode, below the correct answer. A solution for the whole paper appears on every question of that paper, labelled "Full paper solution".
- **Reject** keeps it hidden. The contributor sees the result in My submissions.

Contributors' "this key is correct" confirmations are counted but need no action.

## Remove a contributor

Open **Admin → Contributors** and remove them. They lose access to the portal straight away and go back to being an ordinary student.

Their earlier reviews and uploads are kept, so anything still pending stays in your Review Inbox for you to decide. Their approved solutions stay visible to students.

## How it is kept safe

- **A contributor is only ever made by an admin.** The only ways in are an admin adding them on the Contributors page, or an invitation an admin created. An invitation can only grant the contributor role, never admin, and it only takes effect once the person's email address is **confirmed** (Google sign-in confirms it automatically). Someone who simply types an invited address into a sign-up form gets nothing.
- **Read-only on content.** Contributors have no write access to papers, questions, other people's profiles, or roles. The one thing that changes an answer key is **Accept** in the Review Inbox, and only admins can run it.
- **They see the key only for published papers**, and only through a dedicated function. Reading the answer columns directly is still refused for everyone.
- **They can only act as themselves, on published papers.** A review or upload is rejected if it names another user, a draft paper, or a question from a different paper. They cannot set the "accepted" or "approved" fields themselves.
- **Files are private.** Solutions live in a private storage bucket, in a folder named after the paper and the uploader. A contributor can only upload into their own folder. Students can read a file only after you approve it, and only through a link that expires after an hour. The bucket also refuses anything that is not a PDF or an image, and anything over 10 MB.
- **An admin only ever applies the flag they looked at.** If a contributor edits a flag after you opened the inbox, your Accept is refused and you are asked to reload. Before a corrected key is written, the database also checks that the suggested options exist on that question.
- **Limits.** A contributor can have at most 50 solutions waiting for a decision, and files cannot be swapped after upload while they are pending or approved.
- **Every rule is enforced by the database**, not just hidden in the interface, so it holds even if someone calls the API directly.

To check these on your own project, run the verification table in [DEPLOYMENT.md](DEPLOYMENT.md).
