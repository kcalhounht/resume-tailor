STRONG_RESUME = {
    "personal": {
        "name": "Alex Rivera",
        "email": "alex.rivera@email.com",
        "phone": "555-010-2299",
        "location": "San Francisco, CA",
        "linkedin": "linkedin.com/in/alexrivera",
        "github": "github.com/alexrivera",
    },
    "summary": (
        "Senior Machine Learning Engineer with 6+ years building production LLM "
        "and ranking systems on AWS. Delivered measurable latency and accuracy gains "
        "using Python, PyTorch, and Kubernetes."
    ),
    "skills": [
        {
            "category": "Languages",
            "items": ["Python", "SQL", "TypeScript"],
        },
        {
            "category": "ML",
            "items": ["PyTorch", "TensorFlow", "scikit-learn", "RAG", "LLM"],
        },
        {
            "category": "Cloud",
            "items": ["AWS", "Docker", "Kubernetes", "Terraform"],
        },
        {
            "category": "Data",
            "items": ["PostgreSQL", "Spark", "Kafka", "Airflow"],
        },
    ],
    "experiences": [
        {
            "company": "NovaAI",
            "title": "Senior Machine Learning Engineer",
            "period": "2022 – Present",
            "location": "San Francisco, CA",
            "overview": "Production ML platform for enterprise search and assistants.",
            "bullets": [
                "Architected a RAG pipeline on AWS that cut answer latency 35% for 2M monthly users.",
                "Optimized PyTorch ranking models and improved NDCG 12% across 50M documents.",
                "Led migration of batch features to Spark + Kafka, reducing training cost $180K/year.",
                "Deployed Kubernetes microservices with 99.9% availability for real-time inference.",
                "Built evaluation harness covering 8K labeled queries, raising production accuracy 9%.",
                "Owned end-to-end MLOps with Airflow and Terraform for weekly model releases.",
                "Integrated PostgreSQL feature store serving 15K QPS for personalization workloads.",
            ],
        },
        {
            "company": "DataNest",
            "title": "Machine Learning Engineer",
            "period": "2019 – 2022",
            "location": "Remote",
            "overview": "Analytics SaaS building forecasting products.",
            "bullets": [
                "Developed forecasting models in Python that reduced inventory waste 18% for 40 clients.",
                "Implemented Dockerized training jobs on AWS cutting experiment cycle time 40%.",
                "Created monitoring dashboards tracking drift across 120 production models.",
            ],
        },
    ],
    "education": [
        {
            "school": "Stanford University",
            "degree": "M.S.",
            "discipline": "Computer Science",
            "period": "2019",
            "location": "Stanford, CA",
        }
    ],
}

WEAK_RESUME = {
    "personal": {"name": "Jordan Lee"},
    "summary": "Passionate hard-working team player seeking opportunities.",
    "skills": [{"category": "Skills", "items": ["Python", "Excel"]}],
    "experiences": [
        {
            "company": "Acme",
            "title": "Intern",
            "period": "2024",
            "location": "",
            "overview": "",
            "bullets": [
                "Responsible for various tasks.",
                "Helped the team with different projects.",
                "Worked on stuff.",
            ],
        }
    ],
    "education": [],
}

SAMPLE_JD = """
Job Title: Senior Machine Learning Engineer

We are hiring a Senior Machine Learning Engineer to build production LLM and ranking systems.

Requirements:
- Python, PyTorch, TensorFlow
- AWS, Docker, Kubernetes
- Experience with RAG, LLM, Spark, Kafka
- PostgreSQL and MLOps / Airflow
- Strong ownership of production ML systems
"""
