// Shared synthetic CV. Each fixture adds one hiding technique, or none.
#let cv(extra) = [
  #set page(paper: "a4", margin: 2cm)
  #set text(size: 11pt)
  #block(fill: rgb("#1f2937"), width: 100%, inset: 10pt)[
    #text(fill: white, size: 18pt, weight: "bold")[Jane Doe]
    #linebreak()
    #text(fill: white)[Software engineer]
  ]
  = Experience
  *Acme Corp*, backend engineer, 2021 to today. TypeScript services, PostgreSQL, CI pipelines.

  *Globex*, junior developer, 2018 to 2021. Internal tools in Java.

  = Skills
  TypeScript, Node.js, PostgreSQL, Docker, Git.

  #extra
]
