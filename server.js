const PAGE_DEFINITIONS = [
  { suffix: "executive-mba", name: "Executive MBA", type: "course" },
  { suffix: "executive-programme", name: "Executive Programme", type: "course" },
  { suffix: "executive-program", name: "Executive Program", type: "course" },
  { suffix: "business-analytics", name: "Business Analytics", type: "course" },
  { suffix: "international-business", name: "International Business", type: "course" },
  { suffix: "mba-fabm", name: "MBA FABM", type: "course" },
  { suffix: "mbaex", name: "MBA Executive", type: "course" },
  { suffix: "mba-ex", name: "MBA Executive", type: "course" },
  { suffix: "pgdba", name: "PGDBA", type: "course" },
  { suffix: "pgpx", name: "PGPX", type: "course" },
  { suffix: "pgp", name: "PGP", type: "course" },
  { suffix: "pgdm", name: "PGDM", type: "course" },
  { suffix: "fabm", name: "FABM", type: "course" },
  { suffix: "mba", name: "MBA", type: "course" }
];

// Convert slug into a readable title
function titleFromSlug(value) {
  return String(value || "")
    .split("-")
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Get page definition from suffix
function getPageDefinition(pageSuffix) {
  const suffix = String(pageSuffix || "")
    .toLowerCase()
    .replace(/^[-_]+/, "");

  // Special pages
  if (suffix === "placements") {
    return {
      id: "placements",
      name: "Placements",
      type: "placements"
    };
  }

  if (suffix === "admission" || suffix === "admissions") {
    return {
      id: "admission",
      name: "Admission",
      type: "admission"
    };
  }

  if (suffix === "fees" || suffix === "fee") {
    return {
      id: "fees",
      name: "Fees",
      type: "fees"
    };
  }

  // Course-specific pages
  const definition = PAGE_DEFINITIONS.find(
    item => item.suffix === suffix
  );

  if (definition) {
    return {
      id: definition.suffix,
      name: definition.name,
      type: definition.type
    };
  }

  // Generic page
  if (suffix) {
    return {
      id: suffix,
      name: titleFromSlug(suffix),
      type: "course"
    };
  }

  return {
    id: "overview",
    name: "Overview",
    type: "overview"
  };
}

// Normalise college slug
function normaliseCollegeSlug(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/\.html$/i, "")
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-");
}

// Find the parent college for a page slug
function findParentCollegeId(base, colleges = []) {
  const normalisedBase = normaliseCollegeSlug(base);

  if (!normalisedBase) {
    return null;
  }

  // Exact college match first
  const exact = colleges.find(college => {
    const collegeSlug = normaliseCollegeSlug(
      college.slug || college.id
    );

    return collegeSlug === normalisedBase;
  });

  if (exact) {
    return exact.id;
  }

  // Find longest matching college prefix
  const matches = colleges
    .filter(college => {
      const collegeSlug = normaliseCollegeSlug(
        college.slug || college.id
      );

      return (
        normalisedBase.startsWith(`${collegeSlug}-`)
      );
    })
    .sort((a, b) => {
      const aSlug = normaliseCollegeSlug(a.slug || a.id);
      const bSlug = normaliseCollegeSlug(b.slug || b.id);

      return bSlug.length - aSlug.length;
    });

  return matches.length ? matches[0].id : null;
}

// Classify a website HTML file
function classifyPath(
  filePath,
  colleges = [],
  htmlBases = []
) {
  const filename = String(filePath || "")
    .split("/")
    .pop();

  const base = filename
    .replace(/\.html$/i, "")
    .toLowerCase();

  /*
   * First check whether this is an exact college overview page.
   *
   * Example:
   * iim-kashipur.html
   *
   * becomes:
   *
   * IIM Kashipur
   *   └── Overview
   */
  const exactCollege = colleges.find(college => {
    const collegeSlug = normaliseCollegeSlug(
      college.slug || college.id
    );

    return collegeSlug === base;
  });

  if (exactCollege) {
    return {
      collegeId: exactCollege.id,
      page: {
        id: "overview",
        name: "Overview",
        type: "overview",
        source: filePath,
        status: "live"
      }
    };
  }

  /*
   * Check known page suffixes.
   *
   * Example:
   *
   * iim-kashipur-mba.html
   *
   * becomes:
   *
   * collegeId = iim-kashipur
   * pageId    = mba
   */
  const sortedDefinitions = [
    ...PAGE_DEFINITIONS,
    { suffix: "placements", name: "Placements", type: "placements" },
    { suffix: "admission", name: "Admission", type: "admission" },
    { suffix: "admissions", name: "Admissions", type: "admission" },
    { suffix: "fees", name: "Fees", type: "fees" }
  ].sort((a, b) => {
    return b.suffix.length - a.suffix.length;
  });

  for (const definition of sortedDefinitions) {
    const suffix = `-${definition.suffix}`;

    if (base.endsWith(suffix)) {
      const parentBase = base.slice(
        0,
        -suffix.length
      );

      const parentCollegeId = findParentCollegeId(
        parentBase,
        colleges
      );

      if (parentCollegeId) {
        return {
          collegeId: parentCollegeId,
          page: {
            id: definition.suffix,
            name: definition.name,
            type: definition.type,
            source: filePath,
            status: "live"
          }
        };
      }

      /*
       * If the parent college isn't currently in the registry,
       * try to find an overview HTML file for it during the same sync.
       */
      const matchingOverview = htmlBases.find(
        htmlBase =>
          normaliseCollegeSlug(htmlBase) ===
          normaliseCollegeSlug(parentBase)
      );

      if (matchingOverview) {
        return {
          collegeId: normaliseCollegeSlug(parentBase),
          page: {
            id: definition.suffix,
            name: definition.name,
            type: definition.type,
            source: filePath,
            status: "live"
          }
        };
      }
    }
  }

  /*
   * Generic page suffix handling.
   *
   * Example:
   * iim-kashipur-phd.html
   *
   * becomes:
   *
   * IIM Kashipur
   *   └── PhD
   */
  const knownCollegeBases = colleges
    .map(college =>
      normaliseCollegeSlug(college.slug || college.id)
    )
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  for (const collegeBase of knownCollegeBases) {
    const prefix = `${collegeBase}-`;

    if (base.startsWith(prefix)) {
      const suffix = base.slice(prefix.length);

      if (suffix) {
        return {
          collegeId:
            colleges.find(college =>
              normaliseCollegeSlug(
                college.slug || college.id
              ) === collegeBase
            )?.id || collegeBase,

          page: {
            id: suffix,
            name: titleFromSlug(suffix),
            type: "course",
            source: filePath,
            status: "live"
          }
        };
      }
    }
  }

  /*
   * Fallback:
   * Treat the file as a college overview.
   */
  return {
    collegeId: normaliseCollegeSlug(base),
    page: {
      id: "overview",
      name: "Overview",
      type: "overview",
      source: filePath,
      status: "live"
    }
  };
}
