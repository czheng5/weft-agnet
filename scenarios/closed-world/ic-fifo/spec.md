# Internal FIFO Specification (offline)

- Capacity: DEPTH entries (default 8).
- full must assert only when count == DEPTH (all entries occupied).
- empty must assert when count == 0.
- Writes are accepted only when full is low; reads only when empty is low.
- No external IP, no network access; this document is authoritative.

Review the RTL against this specification.
