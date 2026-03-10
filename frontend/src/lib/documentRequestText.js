const STAFF_ROLES = new Set(["lawyer", "accountant", "paralegal", "legal assistant", "admin"]);

const getDocumentRequestItemCount = (documentRequest) =>
  (documentRequest?.requested_documents || []).length;

const formatItemLabel = (count) => `${count} item${count === 1 ? "" : "s"}`;
const formatCountLabel = (count, singular, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`;

const getDocumentRequestTitle = () => "Document request";

const getDocumentRequestSummary = (documentRequest) => {
  const count = getDocumentRequestItemCount(documentRequest);
  return count > 0 ? formatItemLabel(count) : null;
};

const getDocumentRequestBody = (userRole, documentRequest, { clientCount = 1 } = {}) => {
  const itemCount = getDocumentRequestItemCount(documentRequest);
  const itemLabel = formatCountLabel(itemCount, "item");
  const clientLabel = clientCount === 1 ? "client" : "clients";
  if (userRole === "client") {
    return `You received a document request (${itemLabel})`;
  }
  if (STAFF_ROLES.has(userRole || "")) {
    return `Document request sent to ${clientLabel} (${itemLabel})`;
  }
  return `Document request (${itemLabel})`;
};

export {
  STAFF_ROLES,
  getDocumentRequestItemCount,
  formatItemLabel,
  getDocumentRequestTitle,
  getDocumentRequestSummary,
  getDocumentRequestBody,
};
