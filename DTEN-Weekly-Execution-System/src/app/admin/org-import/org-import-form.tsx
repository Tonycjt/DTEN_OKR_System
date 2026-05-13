"use client";

import { useActionState, useState } from "react";
import { importOrgStructureAction } from "@/app/admin/org-import/actions";
import { initialOrgImportState } from "@/app/admin/org-import/state";
import { Button } from "@/components/ui/button";
import { formatEnumLabel } from "@/lib/format";

export function OrgImportForm() {
  const [state, formAction, isPending] = useActionState(importOrgStructureAction, initialOrgImportState);
  const [csvText, setCsvText] = useState("");
  const status = state.status ?? initialOrgImportState.status;
  const message = state.message ?? initialOrgImportState.message;
  const errors = state.errors ?? [];
  const summary = state.summary ?? null;

  return (
    <div className="stack">
      <form action={formAction} className="stack">
        <label className="field">
          <span>CSV / Excel Paste</span>
          <textarea
            name="csvText"
            onChange={(event) => setCsvText(event.target.value)}
            placeholder="Paste CSV or tab-delimited rows copied from Excel."
            rows={10}
            value={csvText}
          />
        </label>
        <label className="field">
          <span>CSV / TSV Upload</span>
          <input accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" className="file-upload-input" name="csvFile" type="file" />
        </label>
        <div className="table-actions">
          <Button disabled={isPending} type="submit">
            {isPending ? "Importing..." : "Validate And Import"}
          </Button>
          <Button onClick={() => setCsvText(state.sampleCsv ?? initialOrgImportState.sampleCsv)} tone="secondary" type="button">
            Load Sample
          </Button>
        </div>
      </form>

      <div className={status === "validation_failed" ? "alert" : "org-import-status"}>
        <strong>{status === "applied" ? "Import complete" : status === "validation_failed" ? "Import blocked" : "Ready"}</strong>
        <span>{message}</span>
      </div>

      {summary ? (
        <div className="org-import-summary">
          <div>
            <strong>{summary.created}</strong>
            <span>Created</span>
          </div>
          <div>
            <strong>{summary.updated}</strong>
            <span>Updated</span>
          </div>
          <div>
            <strong>{summary.inactive}</strong>
            <span>Inactive</span>
          </div>
          <div>
            <strong>{summary.departmentsCreated}</strong>
            <span>Departments</span>
          </div>
          <div>
            <strong>{summary.teamsCreated}</strong>
            <span>Teams</span>
          </div>
          <div>
            <strong>{summary.managerRelationshipsUpdated}</strong>
            <span>Managers</span>
          </div>
          <div>
            <strong>{summary.reviewOwnersUpdated}</strong>
            <span>Review Owners</span>
          </div>
          <div>
            <strong>{summary.skippedRows}</strong>
            <span>Skipped Rows</span>
          </div>
        </div>
      ) : null}

      {errors.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Row</th>
                <th>Field</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {errors.map((error, index) => (
                <tr key={`${error.rowNumber ?? "file"}-${error.field}-${index}`}>
                  <td>{error.rowNumber ?? "File"}</td>
                  <td>{formatEnumLabel(error.field)}</td>
                  <td>{error.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
