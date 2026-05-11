import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { Comment } from "@/types";

type DiscussionProps = {
  comments: Comment[];
  canComment: boolean;
  getAuthorName: (userId: string) => string;
  onAddComment: (body: string, parentCommentId?: string | null) => void;
};

export function Discussion({ comments, canComment, getAuthorName, onAddComment }: DiscussionProps) {
  const [body, setBody] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const visibleComments = [...comments]
    .filter((comment) => !comment.archived)
    .sort((first, second) => first.createdAt.localeCompare(second.createdAt));
  const topLevelComments = visibleComments.filter((comment) => !comment.parentCommentId);

  function submitComment() {
    const trimmedBody = body.trim();
    if (!trimmedBody) return;
    onAddComment(trimmedBody, null);
    setBody("");
  }

  function submitReply(parentCommentId: string) {
    const trimmedBody = replyDrafts[parentCommentId]?.trim();
    if (!trimmedBody) return;
    onAddComment(trimmedBody, parentCommentId);
    setReplyDrafts((drafts) => ({ ...drafts, [parentCommentId]: "" }));
  }

  return (
    <div className="space-y-4">
      {topLevelComments.length === 0 ? (
        <EmptyState
          title="No comments yet"
          description={canComment ? "Start a lightweight record-bound discussion." : "The selected mock user cannot comment on this record."}
        />
      ) : (
        topLevelComments.map((comment) => (
          <div key={comment.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <CommentBody comment={comment} getAuthorName={getAuthorName} />
            <div className="mt-3 space-y-3 border-l border-slate-200 pl-4">
              {visibleComments
                .filter((reply) => reply.parentCommentId === comment.id)
                .map((reply) => (
                  <CommentBody key={reply.id} comment={reply} getAuthorName={getAuthorName} />
                ))}
            </div>
            {canComment ? (
              <div className="mt-4 grid gap-2 md:grid-cols-[1fr_auto]">
                <input
                  className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-ink-800 outline-none focus:border-dten-blue"
                  value={replyDrafts[comment.id] ?? ""}
                  onChange={(event) => setReplyDrafts({ ...replyDrafts, [comment.id]: event.target.value })}
                  placeholder="Reply to this comment."
                />
                <Button variant="secondary" onClick={() => submitReply(comment.id)}>
                  Reply
                </Button>
              </div>
            ) : null}
          </div>
        ))
      )}

      {canComment ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-600">Add comment</span>
            <textarea
              className="min-h-24 w-full rounded-md border border-slate-200 bg-white px-3 py-3 text-sm leading-6 text-ink-800 outline-none focus:border-dten-blue"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Add plain-text context or follow-up."
            />
          </label>
          <div className="mt-3 flex justify-end">
            <Button variant="primary" onClick={submitComment}>
              Add comment
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CommentBody({ comment, getAuthorName }: { comment: Comment; getAuthorName: (userId: string) => string }) {
  return (
    <div className="rounded-md bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink-950">{getAuthorName(comment.authorUserId)}</p>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">{formatDateTime(comment.createdAt)}</p>
      </div>
      <p className="mt-2 text-sm leading-6 text-ink-600">{comment.body}</p>
    </div>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
