/**
 * BS in Data Science and Applications course catalog, by level.
 *
 * Official titles, transcribed from https://study.iitm.ac.in/ds/academics.html
 * (Foundation / Diploma / Degree sections). Project components with no exam
 * of their own (e.g. "Modern Application Development I - Project") and the
 * PG Diploma / MTech tiers are left out — this app's own level taxonomy only
 * goes Foundation → Diploma → Degree.
 *
 * Used to filter course-name pickers by the level already chosen alongside
 * them, so "Foundation" never offers a degree elective and vice versa.
 */
export const COURSES_BY_LEVEL: Record<string, string[]> = {
  Foundation: [
    "Mathematics for Data Science I",
    "Statistics for Data Science I",
    "Computational Thinking",
    "English I",
    "Mathematics for Data Science II",
    "Statistics for Data Science II",
    "Programming in Python",
    "English II",
  ],
  Diploma: [
    "Database Management Systems",
    "Programming, Data Structures and Algorithms using Python",
    "Modern Application Development I",
    "Programming Concepts using Java",
    "Modern Application Development II",
    "System Commands",
    "Machine Learning Foundations",
    "Business Data Management",
    "Machine Learning Techniques",
    "Machine Learning Practice",
    "Tools in Data Science",
    "Business Analytics",
    "Introduction to Deep Learning and Generative AI",
  ],
  Degree: [
    // Core
    "Software Engineering",
    "Software Testing",
    "AI: Search Methods for Problem Solving",
    "Deep Learning",
    "Strategies for Professional Growth",
    // Electives
    "Algorithmic Thinking in Bioinformatics",
    "Big Data and Biological Networks",
    "Data Visualization Design",
    "Speech Technology",
    "Design Thinking for Data-Driven App Development",
    "Industry 4.0",
    "Market Research",
    "Privacy & Security in Online Social Media",
    "Introduction to Big Data",
    "Financial Forensics",
    "Linear Statistical Models",
    "Advanced Algorithms",
    "Statistical Computing",
    "Computer Systems Design",
    "Programming in C",
    "Mathematical Thinking",
    "Large Language Models",
    "Introduction to Natural Language Processing (i-NLP)",
    "Deep Learning for Computer Vision",
    "Managerial Economics",
    "Game Theory and Strategy",
    "Corporate Finance",
    "Deep Learning Practice",
    "Operating Systems",
    "Mathematical Foundations of Generative AI",
    "Algorithms for Data Science (ADS)",
    "Machine Learning Operations (MLOps)",
    "Data Science and AI Lab",
    "App Dev Lab",
    "Computer Networks",
    "Theory of Computation",
    "Reinforcement Learning",
    "Compiler Design",
    "Discrete Mathematics",
    "Sequential Decision Making",
  ],
};

export const CATALOG_LEVELS = Object.keys(COURSES_BY_LEVEL);
