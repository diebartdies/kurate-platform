// Complete service taxonomy tree
const taxonomy = {
  "version": "1.0",
  "philosophy": "Eliminar barreras. Uno resuelve lo que busca, el otro gana haciendo lo que le apasiona.",
  "domains": [
    {
      "id": "home-property",
      "name": "Hogar y Propiedad",
      "nameEn": "Home & Property",
      "icon": "home",
      "locationScope": [
        "home",
        "neighborhood",
        "countryside"
      ],
      "categories": [
        {
          "id": "cleaning",
          "name": "Limpieza",
          "subcategories": [
            {
              "id": "home-cleaning",
              "name": "Limpieza de Hogar",
              "services": [
                "Limpieza general",
                "Limpieza profunda",
                "Cocina y baños",
                "Ventanas",
                "Alfombras y tapizados",
                "Organización",
                "Post-obra"
              ]
            },
            {
              "id": "office-cleaning",
              "name": "Limpieza de Oficinas",
              "services": [
                "Limpieza diaria",
                "Vidrios",
                "Desinfección",
                "Alfombras corporativas"
              ]
            },
            {
              "id": "industrial-cleaning",
              "name": "Limpieza Industrial",
              "services": [
                "Naves y galpones",
                "Tanques",
                "Maquinaria",
                "Residuos",
                "Ductos"
              ]
            },
            {
              "id": "pool-cleaning",
              "name": "Limpieza de Piletas",
              "services": [
                "Limpieza",
                "Mantenimiento químico",
                "Bombas",
                "Apertura/cierre temporada"
              ]
            }
          ]
        },
        {
          "id": "repairs",
          "name": "Reparaciones y Mantenimiento",
          "subcategories": [
            {
              "id": "plumbing",
              "name": "Plomería",
              "services": [
                "Caños",
                "Destapación",
                "Grifería",
                "Termotanques",
                "Tanques de agua",
                "Riego",
                "Pérdidas",
                "Bombas"
              ]
            },
            {
              "id": "electrical",
              "name": "Electricidad",
              "services": [
                "Instalaciones",
                "Reparaciones",
                "Llaves y tomas",
                "Luminarias",
                "Tableros",
                "Automatización",
                "Puesta a tierra"
              ]
            },
            {
              "id": "hvac",
              "name": "Climatización",
              "services": [
                "Aire acondicionado",
                "Calefacción",
                "Filtros",
                "Estufas",
                "Calderas",
                "Ventilación"
              ]
            },
            {
              "id": "carpentry",
              "name": "Carpintería",
              "services": [
                "Muebles a medida",
                "Reparación",
                "Puertas y ventanas",
                "Pisos madera",
                "Deck",
                "Restauración",
                "Placares"
              ]
            },
            {
              "id": "painting",
              "name": "Pintura",
              "services": [
                "Interior",
                "Exterior",
                "Revestimientos",
                "Yeso",
                "Estucado",
                "Impermeabilización"
              ]
            },
            {
              "id": "general-maint",
              "name": "Mantenimiento General",
              "services": [
                "Handyman",
                "Reparaciones varias",
                "Montaje muebles",
                "Electrodomésticos"
              ]
            },
            {
              "id": "appliance",
              "name": "Reparación Electrodomésticos",
              "services": [
                "Heladeras",
                "Lavarropas",
                "Hornos",
                "Microondas",
                "Lavavajillas"
              ]
            },
            {
              "id": "locksmith",
              "name": "Cerrajería",
              "services": [
                "Apertura",
                "Cerraduras",
                "Seguridad",
                "Duplicados",
                "Cajas fuertes"
              ]
            },
            {
              "id": "pest-control",
              "name": "Control de Plagas",
              "services": [
                "Fumigación",
                "Desinfección",
                "Desratización",
                "Termitas",
                "Cucarachas"
              ]
            }
          ]
        },
        {
          "id": "landscaping",
          "name": "Jardinería y Paisajismo",
          "subcategories": [
            {
              "id": "garden",
              "name": "Mantenimiento de Jardines",
              "services": [
                "Corte césped",
                "Poda",
                "Jardinería",
                "Fumigación",
                "Abono",
                "Riego automático"
              ]
            },
            {
              "id": "landscape",
              "name": "Diseño de Paisajes",
              "services": [
                "Diseño jardines",
                "Jardines verticales",
                "Techos verdes",
                "Paisajismo rural"
              ]
            },
            {
              "id": "rural-land",
              "name": "Campos y Chacras",
              "services": [
                "Mantenimiento campos",
                "Cercos",
                "Caminos rurales",
                "Desmalezado"
              ]
            }
          ]
        },
        {
          "id": "renovation",
          "name": "Remodelación y Construcción",
          "subcategories": [
            {
              "id": "construction",
              "name": "Construcción General",
              "services": [
                "Albañilería",
                "Cimentaciones",
                "Estructuras",
                "Techos",
                "Losas",
                "Revoques"
              ]
            },
            {
              "id": "remodeling",
              "name": "Remodelación",
              "services": [
                "Cocinas",
                "Baños",
                "Ampliaciones",
                "Conversiones"
              ]
            },
            {
              "id": "flooring",
              "name": "Pisos y Revestimientos",
              "services": [
                "Cerámicos",
                "Porcelanatos",
                "Flotantes",
                "Madera",
                "Cemento alisado"
              ]
            },
            {
              "id": "roofing",
              "name": "Techos",
              "services": [
                "Tejas",
                "Chapa",
                "Planos",
                "Impermeabilización",
                "Canaletas"
              ]
            },
            {
              "id": "pool-construction",
              "name": "Construcción de Piletas",
              "services": [
                "Diseño",
                "Construcción",
                "Filtración",
                "Iluminación acuática"
              ]
            }
          ]
        },
        {
          "id": "moving",
          "name": "Mudanzas y Guardado",
          "subcategories": [
            {
              "id": "moving-services",
              "name": "Mudanzas",
              "services": [
                "Locales",
                "Larga distancia",
                "Carga/descarga",
                "Embalaje",
                "Fletes",
                "Oficinas"
              ]
            },
            {
              "id": "storage",
              "name": "Guardado",
              "services": [
                "Depósito muebles",
                "Temporal",
                "Documentos"
              ]
            }
          ]
        },
        {
          "id": "security-svc",
          "name": "Seguridad",
          "subcategories": [
            {
              "id": "alarm-systems",
              "name": "Sistemas de Seguridad",
              "services": [
                "Alarmas",
                "Cámaras",
                "Sensores",
                "Cercos eléctricos",
                "Instalación"
              ]
            },
            {
              "id": "guarding",
              "name": "Vigilancia",
              "services": [
                "Vigilador",
                "Seguridad privada",
                "Control acceso",
                "Eventos"
              ]
            }
          ]
        }
      ]
    },
    {
      "id": "education",
      "name": "Educación",
      "nameEn": "Education",
      "icon": "book",
      "locationScope": [
        "home",
        "neighborhood",
        "city",
        "countryside",
        "online"
      ],
      "categories": [
        {
          "id": "school-staff",
          "name": "Personal Escolar",
          "subcategories": [
            {
              "id": "teachers",
              "name": "Docentes",
              "services": [
                "Maestra/o de grado",
                "Profesor/a secundaria",
                "Docente inicial",
                "Universitario",
                "Idiomas",
                "Preceptor/a",
                "Bibliotecario/a"
              ]
            },
            {
              "id": "assistants",
              "name": "Asistentes Escolares",
              "services": [
                "Asistente de grado",
                "Educación especial",
                "profesional terapéutico",
                "Tutor/a pedagógico",
                "Facilitador/a"
              ]
            },
            {
              "id": "support-staff",
              "name": "Apoyo Escolar",
              "services": [
                "Limpieza escolar",
                "Cocina",
                "Transporte escolar",
                "Portero/a",
                "Secretario/a",
                "Celador/a",
                "Comedor"
              ]
            },
            {
              "id": "special-ed",
              "name": "Educación Especial",
              "services": [
                "Profesor/a especial",
                "Terapista ocupacional",
                "Psicopedagogo/a",
                "Fonoaudiólogo/a",
                "Psicólogo/a escolar",
                "Maestro/a integrador/a"
              ]
            }
          ]
        },
        {
          "id": "academic",
          "name": "Apoyo Académico",
          "subcategories": [
            {
              "id": "tutoring",
              "name": "Tutoría por Materia",
              "services": [
                "Matemáticas",
                "Lengua",
                "Ciencias",
                "Historia",
                "Física",
                "Química",
                "Inglés",
                "Filosofía"
              ]
            },
            {
              "id": "exam-prep",
              "name": "Preparación de Exámenes",
              "services": [
                "Ingreso universidad",
                "Exámenes internacionales",
                "Finales",
                "Becas",
                "Oposiciones"
              ]
            },
            {
              "id": "study-skills",
              "name": "Técnicas de Estudio",
              "services": [
                "Métodos de estudio",
                "Organización",
                "Comprensión",
                "Escritura",
                "Oratoria"
              ]
            }
          ]
        },
        {
          "id": "early-childhood",
          "name": "Primera Infancia",
          "subcategories": [
            {
              "id": "preschool",
              "name": "Nivel Inicial",
              "services": [
                "Maestra/o jardinera",
                "Asistente jardín",
                "Estimulación temprana",
                "Jardín maternal"
              ]
            },
            {
              "id": "child-dev",
              "name": "Desarrollo Infantil",
              "services": [
                "Estimulación lenguaje",
                "Psicomotricidad",
                "Terapia ocupacional"
              ]
            }
          ]
        },
        {
          "id": "adult-ed",
          "name": "Educación para Adultos",
          "subcategories": [
            {
              "id": "basic-ed",
              "name": "Básica Adultos",
              "services": [
                "Alfabetización",
                "Primaria adultos",
                "Secundaria adultos",
                "Formación laboral",
                "Oficios"
              ]
            },
            {
              "id": "professional-dev",
              "name": "Desarrollo Profesional",
              "services": [
                "Capacitación",
                "Liderazgo",
                "Comunicación",
                "Trabajo equipo",
                "Gestión tiempo"
              ]
            }
          ]
        },
        {
          "id": "music-arts",
          "name": "Música y Artes",
          "subcategories": [
            {
              "id": "music",
              "name": "Clases de Música",
              "services": [
                "Guitarra",
                "Piano",
                "Violín",
                "Batería",
                "Canto",
                "Teoría",
                "Producción musical"
              ]
            },
            {
              "id": "art",
              "name": "Clases de Arte",
              "services": [
                "Dibujo",
                "Pintura",
                "Escultura",
                "Arte digital",
                "Fotografía",
                "Cerámica"
              ]
            },
            {
              "id": "dance",
              "name": "Danza",
              "services": [
                "Ballet",
                "Tango",
                "Salsa",
                "Contemporáneo",
                "Hip hop",
                "Folklore"
              ]
            }
          ]
        },
        {
          "id": "languages",
          "name": "Idiomas",
          "subcategories": [
            {
              "id": "english",
              "name": "Inglés",
              "services": [
                "Conversación",
                "Gramática",
                "Exámenes",
                "Negocios",
                "Niños",
                "Adultos"
              ]
            },
            {
              "id": "spanish",
              "name": "Español",
              "services": [
                "Español extranjeros",
                "Gramática",
                "Literatura",
                "Redacción"
              ]
            },
            {
              "id": "other-languages",
              "name": "Otros Idiomas",
              "services": [
                "Portugués",
                "Francés",
                "Italiano",
                "Alemán",
                "Chino",
                "Japonés"
              ]
            }
          ]
        },
        {
          "id": "sports-ed",
          "name": "Deportes",
          "subcategories": [
            {
              "id": "coaching",
              "name": "Entrenamiento",
              "services": [
                "Fútbol",
                "Tenis",
                "Natación",
                "Básquet",
                "Vóley",
                "Atletismo",
                "Artes marciales"
              ]
            },
            {
              "id": "fitness",
              "name": "Fitness",
              "services": [
                "Personal trainer",
                "Yoga",
                "Pilates",
                "Crossfit",
                "Gimnasia",
                "Funcional"
              ]
            },
            {
              "id": "outdoor",
              "name": "Aire Libre",
              "services": [
                "Senderismo",
                "Ciclismo",
                "Escalada",
                "Kayak",
                "Cabalgatas",
                "Pesca deportiva"
              ]
            }
          ]
        }
      ]
    },
    {
      "id": "health-wellness",
      "name": "Salud y Bienestar",
      "nameEn": "Health & Wellness",
      "icon": "heart",
      "locationScope": [
        "home",
        "neighborhood",
        "city",
        "countryside",
        "online"
      ],
      "categories": [
        {
          "id": "medical",
          "name": "Medicina",
          "subcategories": [
            {
              "id": "general-practice",
              "name": "Medicina General",
              "services": [
                "Médico clínico",
                "Medicina familiar",
                "Preventiva",
                "Chequeos"
              ]
            },
            {
              "id": "specialists",
              "name": "Médicos Especialistas",
              "services": [
                "Pediatría",
                "Ginecología",
                "Cardiología",
                "Dermatología",
                "Neurología",
                "Traumatología",
                "Oftalmología",
                "Odontología"
              ]
            },
            {
              "id": "paramedical",
              "name": "Paramédicos",
              "services": [
                "Enfermero/a",
                "Flebotomía",
                "Curaciones",
                "Control signos vitales",
                "profesional terapéutico"
              ]
            },
            {
              "id": "rural-health",
              "name": "Salud Rural",
              "services": [
                "Médico rural",
                "Posta sanitaria",
                "Emergencias rurales",
                "Vacunación"
              ]
            }
          ]
        },
        {
          "id": "mental-health",
          "name": "Salud Mental",
          "subcategories": [
            {
              "id": "therapy",
              "name": "Terapia Psicológica",
              "services": [
                "Psicólogo/a",
                "Psicoterapia",
                "TCC",
                "Psicoanálisis",
                "Terapia pareja",
                "Terapia familiar"
              ]
            },
            {
              "id": "psychiatry",
              "name": "Psiquiatría",
              "services": [
                "Psiquiatra",
                "Evaluación",
                "Medicación",
                "Psicofarmacología"
              ]
            },
            {
              "id": "wellness",
              "name": "Bienestar",
              "services": [
                "Mindfulness",
                "Meditación",
                "Coaching emocional",
                "Manejo estrés",
                "Terapia ocupacional"
              ]
            }
          ]
        },
        {
          "id": "alternative",
          "name": "Medicina Alternativa",
          "subcategories": [
            {
              "id": "natural",
              "name": "Terapias Naturales",
              "services": [
                "Acupuntura",
                "Homeopatía",
                "Medicina china",
                "Naturopatía",
                "Fitoterapia"
              ]
            },
            {
              "id": "bodywork",
              "name": "Terapias Corporales",
              "services": [
                "Masajes",
                "Reiki",
                "Reflexología",
                "Quiropraxia",
                "Osteopatía",
                "Shiatsu"
              ]
            }
          ]
        },
        {
          "id": "elder-care",
          "name": "Cuidado de Mayores",
          "subcategories": [
            {
              "id": "home-care",
              "name": "Cuidado en Casa",
              "services": [
                "profesional",
                "Cuidador/a",
                "Asistencia personal",
                "Baño asistido",
                "Medicación"
              ]
            },
            {
              "id": "geriatric-nursing",
              "name": "Enfermería Geriátrica",
              "services": [
                "Enfermero/a geriátrico",
                "Cuidados paliativos",
                "Post-operatorio",
                "Estimulación cognitiva"
              ]
            },
            {
              "id": "elder-companion",
              "name": "Acompañamiento",
              "services": [
                "Compañía",
                "Lectura",
                "Paseos",
                "Actividades recreativas",
                "Trámites"
              ]
            }
          ]
        },
        {
          "id": "nutrition",
          "name": "Nutrición y Dietética",
          "subcategories": [
            {
              "id": "dietetics",
              "name": "Nutrición",
              "services": [
                "Nutricionista",
                "Dieta personalizada",
                "Nutrición deportiva",
                "Trastornos alimentarios"
              ]
            },
            {
              "id": "healthy-cooking",
              "name": "Cocina Saludable",
              "services": [
                "Cocinero/a saludable",
                "Meal prep",
                "Vegetariana/vegana",
                "Alimentación infantil"
              ]
            }
          ]
        },
        {
          "id": "rehab",
          "name": "Fisioterapia y Rehabilitación",
          "subcategories": [
            {
              "id": "kinesiology",
              "name": "Kinesiología",
              "services": [
                "Kinesiólogo/a",
                "Rehabilitación",
                "Deportiva",
                "Lesiones"
              ]
            },
            {
              "id": "speech",
              "name": "Fonoaudiología",
              "services": [
                "Fonoaudiólogo/a",
                "Terapia lenguaje",
                "Deglución",
                "Voz profesional"
              ]
            }
          ]
        }
      ]
    },
    {
      "id": "professional-services",
      "name": "Servicios Profesionales",
      "nameEn": "Professional Services",
      "icon": "briefcase",
      "locationScope": [
        "city",
        "online"
      ],
      "categories": [
        {
          "id": "legal",
          "name": "Asesoría Legal",
          "subcategories": [
            {
              "id": "lawyers",
              "name": "Abogados",
              "services": [
                "Derecho civil",
                "Derecho laboral",
                "Derecho penal",
                "Derecho comercial",
                "Familia",
                "Sucesiones"
              ]
            },
            {
              "id": "notary",
              "name": "Escribanía",
              "services": [
                "Escribano/a",
                "Escrituras",
                "Poderes",
                "Contratos"
              ]
            },
            {
              "id": "paralegal",
              "name": "Servicios Legales",
              "services": [
                "Asistente legal",
                "Trámites",
                "Gestión documental",
                "Traducciones legales"
              ]
            }
          ]
        },
        {
          "id": "accounting",
          "name": "Contabilidad y Finanzas",
          "subcategories": [
            {
              "id": "accountants",
              "name": "Contadores",
              "services": [
                "Contador/a",
                "Liquidación sueldos",
                "Impuestos",
                "Balance",
                "Monotributo"
              ]
            },
            {
              "id": "financial",
              "name": "Asesoría Financiera",
              "services": [
                "Asesor financiero",
                "Planificación patrimonial",
                "Seguros",
                "Inversiones"
              ]
            }
          ]
        },
        {
          "id": "admin",
          "name": "Administración y Oficina",
          "subcategories": [
            {
              "id": "virtual-assistant",
              "name": "Asistente Virtual",
              "services": [
                "Asistente administrativo",
                "Agenda",
                "Correos",
                "Facturación",
                "Atención cliente"
              ]
            },
            {
              "id": "reception",
              "name": "Recepción",
              "services": [
                "Recepcionista",
                "Telefonista",
                "Atención presencial"
              ]
            },
            {
              "id": "data-entry",
              "name": "Carga de Datos",
              "services": [
                "Digitación",
                "Procesamiento datos",
                "Archivo",
                "Inventario"
              ]
            }
          ]
        },
        {
          "id": "marketing",
          "name": "Marketing y Publicidad",
          "subcategories": [
            {
              "id": "digital-marketing",
              "name": "Marketing Digital",
              "services": [
                "Redes sociales",
                "SEO",
                "Google Ads",
                "Email marketing",
                "Content marketing"
              ]
            },
            {
              "id": "graphic-design",
              "name": "Diseño Gráfico",
              "services": [
                "Logotipos",
                "Branding",
                "Flyers",
                "Redes sociales",
                "Presentaciones"
              ]
            },
            {
              "id": "photography",
              "name": "Fotografía y Video",
              "services": [
                "Fotografía profesional",
                "Video corporativo",
                "Edición",
                "Drone",
                "Eventos"
              ]
            },
            {
              "id": "writing",
              "name": "Redacción y Traducción",
              "services": [
                "Redactor/a",
                "Copywriting",
                "Traducciones",
                "Corrección",
                "Contenido web"
              ]
            }
          ]
        },
        {
          "id": "consulting",
          "name": "Consultoría",
          "subcategories": [
            {
              "id": "business-consulting",
              "name": "Consultoría Empresarial",
              "services": [
                "Consultor/a",
                "Planeación estratégica",
                "Optimización procesos",
                "RRHH"
              ]
            },
            {
              "id": "it-consulting",
              "name": "Consultoría TI",
              "services": [
                "Consultor TI",
                "Transformación digital",
                "Ciberseguridad",
                "Infraestructura"
              ]
            }
          ]
        },
        {
          "id": "real-estate",
          "name": "Bienes Raíces",
          "subcategories": [
            {
              "id": "agents",
              "name": "Corredores Inmobiliarios",
              "services": [
                "Compra/venta",
                "Alquileres",
                "Tasaciones",
                "Administración propiedades"
              ]
            },
            {
              "id": "architecture",
              "name": "Arquitectura",
              "services": [
                "Arquitecto/a",
                "Planos",
                "Proyectos",
                "Dirección obra",
                "Diseño interiores"
              ]
            },
            {
              "id": "surveyors",
              "name": "Agrimensura",
              "services": [
                "Agrimensor/a",
                "Relevamiento",
                "Delimitaciones",
                "Topografía"
              ]
            }
          ]
        }
      ]
    },
    {
      "id": "beauty",
      "name": "servicios y Cuidado Personal",
      "nameEn": "Beauty & Personal Care",
      "icon": "sparkles",
      "locationScope": [
        "home",
        "neighborhood",
        "city"
      ],
      "categories": [
        {
          "id": "hair",
          "name": "Peluquería y Barbería",
          "subcategories": [
            {
              "id": "hairdressing",
              "name": "Peluquería",
              "services": [
                "Corte dama",
                "Corte caballero",
                "Color",
                "Mechas",
                "Alisado",
                "Peinados",
                "Tratamientos"
              ]
            },
            {
              "id": "barber",
              "name": "Barbería",
              "services": [
                "Corte clásico",
                "Barba",
                "Afeitado",
                "Perfilado"
              ]
            }
          ]
        },
        {
          "id": "nails",
          "name": "Manos y Pies",
          "subcategories": [
            {
              "id": "nail-care",
              "name": "Manicuría y Pedicuría",
              "services": [
                "Manicuría",
                "Pedicuría",
                "Semipermanente",
                "Esculpidas",
                "Acrílicas",
                "Kapping"
              ]
            }
          ]
        },
        {
          "id": "skincare",
          "name": "Cuidado de la Piel",
          "subcategories": [
            {
              "id": "facial",
              "name": "Tratamientos Faciales",
              "services": [
                "Limpieza facial",
                "Hidratación",
                "Exfoliación",
                "Anti-edad",
                "Microdermoabrasión"
              ]
            },
            {
              "id": "makeup",
              "name": "Maquillaje",
              "services": [
                "Maquillaje social",
                "Novias",
                "Artístico",
                "Automaquillaje",
                "FX"
              ]
            }
          ]
        },
        {
          "id": "spa",
          "name": "Spa y Bienestar",
          "subcategories": [
            {
              "id": "massage",
              "name": "Masajes",
              "services": [
                "Relajantes",
                "Descontracturantes",
                "Deportivos",
                "Piedras calientes",
                "Linfo"
              ]
            },
            {
              "id": "treatments",
              "name": "Tratamientos Spa",
              "services": [
                "Envolturas",
                "Hidroterapia",
                "Sauna",
                "Baño turco",
                "Aromaterapia"
              ]
            }
          ]
        },
        {
          "id": "tattoo",
          "name": "Tatuajes y Piercings",
          "subcategories": [
            {
              "id": "tattoo-art",
              "name": "Tatuajes",
              "services": [
                "Diseño personalizado",
                "Cover up",
                "Realismo",
                "Tradicional",
                "Geométrico",
                "Retoque"
              ]
            },
            {
              "id": "piercing",
              "name": "Piercings",
              "services": [
                "Colocación",
                "Cambio",
                "Cuidado posterior"
              ]
            }
          ]
        }
      ]
    },
    {
      "id": "technology",
      "name": "Tecnología y TI",
      "nameEn": "Technology & IT",
      "icon": "monitor",
      "locationScope": [
        "home",
        "city",
        "online"
      ],
      "categories": [
        {
          "id": "software-dev",
          "name": "Desarrollo de Software",
          "subcategories": [
            {
              "id": "web-dev",
              "name": "Desarrollo Web",
              "services": [
                "Frontend",
                "Backend",
                "Full stack",
                "E-commerce",
                "APIs",
                "Landing pages"
              ]
            },
            {
              "id": "mobile-dev",
              "name": "Desarrollo Mobile",
              "services": [
                "Apps iOS",
                "Apps Android",
                "React Native",
                "Flutter"
              ]
            },
            {
              "id": "app-dev",
              "name": "Aplicaciones",
              "services": [
                "Apps desktop",
                "Sistemas a medida",
                "Automatización"
              ]
            }
          ]
        },
        {
          "id": "it-support",
          "name": "Soporte Técnico",
          "subcategories": [
            {
              "id": "computer-repair",
              "name": "Reparación de PC",
              "services": [
                "Diagnóstico",
                "Reparación hardware",
                "Limpieza",
                "Actualización",
                "Armado"
              ]
            },
            {
              "id": "networking",
              "name": "Redes",
              "services": [
                "Instalación redes",
                "WiFi",
                "Servidores",
                "Infraestructura",
                "Cableado"
              ]
            },
            {
              "id": "tech-support",
              "name": "Soporte TI",
              "services": [
                "Soporte remoto",
                "Instalación software",
                "Migración datos",
                "Ciberseguridad"
              ]
            }
          ]
        },
        {
          "id": "design-ux",
          "name": "Diseño y Multimedia",
          "subcategories": [
            {
              "id": "ux-ui",
              "name": "UX/UI",
              "services": [
                "Diseño interfaces",
                "UX research",
                "Prototipado",
                "Testing"
              ]
            },
            {
              "id": "animation",
              "name": "Animación",
              "services": [
                "2D/3D",
                "Motion graphics",
                "Videoedición",
                "Post-producción"
              ]
            }
          ]
        }
      ]
    },
    {
      "id": "events",
      "name": "Eventos y Gastronomía",
      "nameEn": "Events & Hospitality",
      "icon": "party",
      "locationScope": [
        "home",
        "neighborhood",
        "city",
        "countryside"
      ],
      "categories": [
        {
          "id": "catering",
          "name": "Catering y Comida",
          "subcategories": [
            {
              "id": "catering-svc",
              "name": "Servicio de Catering",
              "services": [
                "Eventos",
                "Empresarial",
                "Casamientos",
                "Cumpleaños",
                "Coffee break"
              ]
            },
            {
              "id": "chefs",
              "name": "Cocineros/as",
              "services": [
                "Cocinero/a particular",
                "Chef a domicilio",
                "Cocina internacional",
                "Parrillero/a",
                "Pastelero/a"
              ]
            },
            {
              "id": "meal-service",
              "name": "Servicio de Comida",
              "services": [
                "Viandas",
                "Comida para llevar",
                "Dietas",
                "Lunch"
              ]
            }
          ]
        },
        {
          "id": "event-planning",
          "name": "Planificación de Eventos",
          "subcategories": [
            {
              "id": "planners",
              "name": "Organizadores",
              "services": [
                "Organizador/a eventos",
                "Bodas",
                "Corporativos",
                "Fiestas infantiles"
              ]
            },
            {
              "id": "entertainment",
              "name": "Entretenimiento",
              "services": [
                "DJ",
                "Músicos en vivo",
                "Animador/a",
                "Sonido e iluminación"
              ]
            }
          ]
        },
        {
          "id": "waitstaff",
          "name": "Personal de Servicio",
          "subcategories": [
            {
              "id": "servers",
              "name": "Mozos/as",
              "services": [
                "Mozo/a",
                "Bartender",
                "Camarero/a",
                "Sommelier"
              ]
            },
            {
              "id": "kitchen-staff",
              "name": "Personal de Cocina",
              "services": [
                "Ayudante cocina",
                "Lavaplatos",
                "Cocinero/a línea",
                "Panadero/a"
              ]
            }
          ]
        },
        {
          "id": "hospitality",
          "name": "Hotelería",
          "subcategories": [
            {
              "id": "hotel-staff",
              "name": "Personal Hotelero",
              "services": [
                "Recepción",
                "Housekeeping",
                "Conserjería",
                "Mantenimiento"
              ]
            },
            {
              "id": "tourism",
              "name": "Turismo",
              "services": [
                "Guía turístico/a",
                "Coordinador/a viajes",
                "Atención turista"
              ]
            }
          ]
        }
      ]
    },
    {
      "id": "transport",
      "name": "Transporte y Logística",
      "nameEn": "Transport & Logistics",
      "icon": "truck",
      "locationScope": [
        "home",
        "neighborhood",
        "city",
        "countryside"
      ],
      "categories": [
        {
          "id": "passenger-transport",
          "name": "Transporte de Personas",
          "subcategories": [
            {
              "id": "rides",
              "name": "Viajes y Traslados",
              "services": [
                "Taxi",
                "Remis",
                "Transfer aeropuerto",
                "Viajes interurbanos",
                "Transporte escolar"
              ]
            },
            {
              "id": "tourism-transport",
              "name": "Transporte Turístico",
              "services": [
                "City tour",
                "Excursiones",
                "Transporte grupal",
                "Minibus"
              ]
            },
            {
              "id": "special-transport",
              "name": "Transporte Especial",
              "services": [
                "Ambulancia",
                "Transporte discapacitados",
                "Traslado adultos mayores"
              ]
            }
          ]
        },
        {
          "id": "delivery",
          "name": "Envíos y Delivery",
          "subcategories": [
            {
              "id": "courier",
              "name": "Mensajería",
              "services": [
                "Mensajero/a",
                "Cadete",
                "Envíos urbanos",
                "Paquetería",
                "Documentación"
              ]
            },
            {
              "id": "food-delivery",
              "name": "Delivery de Comida",
              "services": [
                "Repartidor/a",
                "Delivery restaurantes",
                "Compra y entrega"
              ]
            },
            {
              "id": "cargo",
              "name": "Carga",
              "services": [
                "Carga general",
                "Mudanzas",
                "Logística"
              ]
            }
          ]
        },
        {
          "id": "auto-services",
          "name": "Servicios Automotrices",
          "subcategories": [
            {
              "id": "mechanics",
              "name": "Mecánica",
              "services": [
                "Mecánico/a",
                "Electricista auto",
                "Diagnóstico",
                "Motor",
                "Transmisión",
                "Frenos"
              ]
            },
            {
              "id": "body-shop",
              "name": "Chapa y Pintura",
              "services": [
                "Chapa",
                "Pintura auto",
                "Desabolladura",
                "Pulido",
                "Anticorrosión"
              ]
            },
            {
              "id": "detailing",
              "name": "Detailing",
              "services": [
                "Lavado y pulido",
                "Limpieza interior",
                "Encerado",
                "Cuero",
                "Motor"
              ]
            },
            {
              "id": "tires",
              "name": "Neumáticos",
              "services": [
                "Cambio",
                "Alineación",
                "Balanceo",
                "Reparación pinchaduras"
              ]
            }
          ]
        },
        {
          "id": "heavy-transport",
          "name": "Transporte Pesado",
          "subcategories": [
            {
              "id": "trucking",
              "name": "Camiones",
              "services": [
                "Camionero/a",
                "Carga pesada",
                "Granel",
                "Contenedores"
              ]
            },
            {
              "id": "machinery",
              "name": "Maquinaria",
              "services": [
                "Operador/a maquinaria",
                "Retroexcavadora",
                "Grúa",
                "Montacargas"
              ]
            }
          ]
        }
      ]
    },
    {
      "id": "child-pet",
      "name": "Cuidado Niños y Mascotas",
      "nameEn": "Child & Pet Care",
      "icon": "paw",
      "locationScope": [
        "home",
        "neighborhood",
        "city"
      ],
      "categories": [
        {
          "id": "childcare",
          "name": "Cuidado Infantil",
          "subcategories": [
            {
              "id": "babysitting",
              "name": "Babysitter",
              "services": [
                "Babysitter",
                "Niñera/o",
                "Post-horario escolar",
                "Cuidado nocturno"
              ]
            },
            {
              "id": "nanny",
              "name": "Niñera",
              "services": [
                "Tiempo completo",
                "Medio tiempo",
                "Con manejo",
                "Bilingüe"
              ]
            },
            {
              "id": "after-school",
              "name": "Extraescolares",
              "services": [
                "Apoyo escolar",
                "Talleres recreativos",
                "Deportes",
                "Música",
                "Arte"
              ]
            }
          ]
        },
        {
          "id": "petcare",
          "name": "Cuidado de Mascotas",
          "subcategories": [
            {
              "id": "pet-sitting",
              "name": "Pet Sitting",
              "services": [
                "Cuidador/a mascotas",
                "Paseador/a",
                "Hospedaje",
                "Visitas domicilio"
              ]
            },
            {
              "id": "pet-grooming",
              "name": "Peluquería Canina",
              "services": [
                "Baño y cepillado",
                "Corte higiénico",
                "Raza",
                "Corte artístico"
              ]
            },
            {
              "id": "vet",
              "name": "Salud Animal",
              "services": [
                "Veterinario/a",
                "Asistente veterinario",
                "Paseador/a especializado"
              ]
            },
            {
              "id": "pet-trainer",
              "name": "Adiestramiento",
              "services": [
                "Adiestrador/a",
                "Obediencia",
                "Modificación conducta",
                "Socialización"
              ]
            }
          ]
        }
      ]
    },
    {
      "id": "trades",
      "name": "Oficios Especializados",
      "nameEn": "Skilled Trades",
      "icon": "wrench",
      "locationScope": [
        "home",
        "neighborhood",
        "city",
        "countryside"
      ],
      "categories": [
        {
          "id": "metalwork",
          "name": "Metalurgia",
          "subcategories": [
            {
              "id": "welding",
              "name": "Soldadura",
              "services": [
                "Soldador/a",
                "Estructuras metálicas",
                "Portones",
                "Rejas",
                "Barandas",
                "Herrería"
              ]
            },
            {
              "id": "machining",
              "name": "Mecanizado",
              "services": [
                "Torno",
                "Fresa",
                "CNC",
                "Ajuste mecánico"
              ]
            }
          ]
        },
        {
          "id": "masonry",
          "name": "Albañilería",
          "subcategories": [
            {
              "id": "mason",
              "name": "Albañil",
              "services": [
                "Albañil",
                "Pocero/a",
                "Ladrillos",
                "Tabiques",
                "Contrapisos"
              ]
            },
            {
              "id": "tiler",
              "name": "Colocador de Cerámicos",
              "services": [
                "Colocador/a",
                "Porcelanato",
                "Mosaicos",
                "Revestimientos"
              ]
            },
            {
              "id": "plaster",
              "name": "Yesero/a",
              "services": [
                "Yeso",
                "Durlock",
                "Cielorrasos",
                "Tabiques yeso"
              ]
            }
          ]
        },
        {
          "id": "woodwork",
          "name": "Trabajo en Madera",
          "subcategories": [
            {
              "id": "carpenter",
              "name": "Carpintero/a",
              "services": [
                "Carpintero obra",
                "Muebles cocina",
                "Aberturas",
                "Deck",
                "Cercos madera"
              ]
            },
            {
              "id": "upholstery",
              "name": "Tapicería",
              "services": [
                "Tapicero/a",
                "Restauración muebles",
                "Sillones",
                "Sillas"
              ]
            }
          ]
        },
        {
          "id": "glass",
          "name": "Vidrio y Cristal",
          "subcategories": [
            {
              "id": "glazier",
              "name": "Vidriero/a",
              "services": [
                "Vidriero/a",
                "Ventanas",
                "Espejos",
                "Mamparas",
                "Cristales templados"
              ]
            }
          ]
        }
      ]
    },
    {
      "id": "agriculture",
      "name": "Agricultura y Campo",
      "nameEn": "Agriculture & Rural",
      "icon": "leaf",
      "locationScope": [
        "countryside"
      ],
      "categories": [
        {
          "id": "farming",
          "name": "Producción Agrícola",
          "subcategories": [
            {
              "id": "crops",
              "name": "Cultivos",
              "services": [
                "Cosecha",
                "Siembra",
                "Fumigación",
                "Riego agrícola",
                "Poda frutales"
              ]
            },
            {
              "id": "harvest",
              "name": "Cosecha",
              "services": [
                "Cosecha manual",
                "Cosecha mecanizada",
                "Embalaje",
                "Clasificación"
              ]
            }
          ]
        },
        {
          "id": "livestock",
          "name": "Ganadería",
          "subcategories": [
            {
              "id": "cattle",
              "name": "Ganado",
              "services": [
                "Ganadero/a",
                "Veterinario rural",
                "Esquila",
                "Alambrado",
                "Manejo rodeo"
              ]
            },
            {
              "id": "poultry",
              "name": "Aves",
              "services": [
                "Granja avícola",
                "Producción huevos",
                "Crianza aves"
              ]
            }
          ]
        },
        {
          "id": "agri-machinery",
          "name": "Maquinaria Agrícola",
          "subcategories": [
            {
              "id": "tractor",
              "name": "Tractorista",
              "services": [
                "Tractorista",
                "Operador/a maquinaria",
                "Cosechadora"
              ]
            },
            {
              "id": "agri-repair",
              "name": "Mantenimiento Rural",
              "services": [
                "Reparación maquinaria",
                "Electricidad rural",
                "Instalaciones"
              ]
            }
          ]
        },
        {
          "id": "agri-services",
          "name": "Servicios Rurales",
          "subcategories": [
            {
              "id": "farm-hand",
              "name": "Puestero/a",
              "services": [
                "Puestero/a",
                "Peón rural",
                "Encargado/a campo",
                "Domador/a"
              ]
            },
            {
              "id": "agronomy",
              "name": "Agronomía",
              "services": [
                "Ingeniero/a agrónomo",
                "Asesor agrícola",
                "Análisis suelo",
                "Planeamiento"
              ]
            }
          ]
        },
        {
          "id": "agri-processing",
          "name": "Valor Agregado",
          "subcategories": [
            {
              "id": "preserves",
              "name": "Conservas y Elaboración",
              "services": [
                "Dulces",
                "Conservas",
                "Quesos",
                "Embutidos",
                "Vino artesanal"
              ]
            },
            {
              "id": "bakery",
              "name": "Panadería Rural",
              "services": [
                "Pan casero",
                "Facturas",
                "Panificados integrales",
                "Tortas rurales"
              ]
            }
          ]
        }
      ]
    },
    {
      "id": "community",
      "name": "Comunidad y Social",
      "nameEn": "Community & Social",
      "icon": "people",
      "locationScope": [
        "neighborhood",
        "city",
        "countryside"
      ],
      "categories": [
        {
          "id": "social-work",
          "name": "Trabajo Social",
          "subcategories": [
            {
              "id": "social-workers",
              "name": "Trabajadores Sociales",
              "services": [
                "Trabajador/a social",
                "Intervención familiar",
                "Gestión recursos",
                "Mediación"
              ]
            },
            {
              "id": "community-dev",
              "name": "Desarrollo Comunitario",
              "services": [
                "Promotor/a social",
                "Organización vecinal",
                "Proyectos barriales",
                "Voluntariado"
              ]
            }
          ]
        },
        {
          "id": "caregiving",
          "name": "Cuidado y Asistencia",
          "subcategories": [
            {
              "id": "disability",
              "name": "Discapacidad",
              "services": [
                "Asistente discapacidad",
                "profesional",
                "Terapias inclusivas",
                "Lengua señas",
                "Transporte adaptado"
              ]
            },
            {
              "id": "home-health",
              "name": "Asistencia Domiciliaria",
              "services": [
                "Asistente domiciliario",
                "Cuidados paliativos",
                "Acompañamiento hospitalario"
              ]
            }
          ]
        },
        {
          "id": "spiritual",
          "name": "Servicios Espirituales",
          "subcategories": [
            {
              "id": "pastoral",
              "name": "Pastoral",
              "services": [
                "Pastor/a",
                "Catequista",
                "Grupos reflexión",
                "Acompañamiento espiritual"
              ]
            },
            {
              "id": "community-events",
              "name": "Eventos Comunitarios",
              "services": [
                "Fiestas barriales",
                "Ferias",
                "Actividades culturales"
              ]
            }
          ]
        }
      ]
    },
    {
      "id": "arts",
      "name": "Arte y Creatividad",
      "nameEn": "Arts & Creative",
      "icon": "palette",
      "locationScope": [
        "home",
        "city",
        "online"
      ],
      "categories": [
        {
          "id": "visual-arts",
          "name": "Artes Visuales",
          "subcategories": [
            {
              "id": "painting-art",
              "name": "Pintura Artística",
              "services": [
                "Pintor/a",
                "Ilustrador/a",
                "Retratos",
                "Murales",
                "Arte abstracto"
              ]
            },
            {
              "id": "sculpture",
              "name": "Escultura",
              "services": [
                "Escultor/a",
                "Cerámica",
                "Arte resina",
                "Tallado madera/piedra"
              ]
            },
            {
              "id": "digital-art",
              "name": "Arte Digital",
              "services": [
                "Ilustración digital",
                "Animación",
                "NFT",
                "Arte 3D",
                "Modelado"
              ]
            }
          ]
        },
        {
          "id": "performing-arts",
          "name": "Artes Escénicas",
          "subcategories": [
            {
              "id": "theatre",
              "name": "Teatro",
              "services": [
                "Actor/Actriz",
                "Director/a",
                "Dramaturgo/a",
                "Escenografía",
                "Títeres"
              ]
            },
            {
              "id": "music-perf",
              "name": "Música",
              "services": [
                "Músico sesión",
                "Compositor/a",
                "Productor musical",
                "DJ",
                "Banda"
              ]
            },
            {
              "id": "dance-perf",
              "name": "Danza",
              "services": [
                "Bailarín/a",
                "Coreógrafo/a",
                "Clases danza",
                "Espectáculos"
              ]
            }
          ]
        },
        {
          "id": "crafts",
          "name": "Artesanía",
          "subcategories": [
            {
              "id": "handcrafts",
              "name": "Manualidades",
              "services": [
                "Tejido",
                "Crochet",
                "Bordado",
                "Macramé",
                "Joyería artesanal",
                "Velas"
              ]
            },
            {
              "id": "deco",
              "name": "Decoración",
              "services": [
                "Decoración interiores",
                "Florería",
                "Diseño espacios",
                "Ambientación"
              ]
            }
          ]
        },
        {
          "id": "cultural",
          "name": "Gestión Cultural",
          "subcategories": [
            {
              "id": "curator",
              "name": "Curaduría",
              "services": [
                "Curador/a",
                "Museos",
                "Exposiciones",
                "Eventos culturales"
              ]
            },
            {
              "id": "promoter",
              "name": "Promoción Cultural",
              "services": [
                "Gestor/a cultural",
                "Producción eventos",
                "Mediación cultural"
              ]
            }
          ]
        }
      ]
    },
    {
      "id": "sports-rec",
      "name": "Deportes y Recreación",
      "nameEn": "Sports & Recreation",
      "icon": "trophy",
      "locationScope": [
        "home",
        "neighborhood",
        "city",
        "countryside"
      ],
      "categories": [
        {
          "id": "sports-training",
          "name": "Entrenamiento Deportivo",
          "subcategories": [
            {
              "id": "personal-training",
              "name": "Personal Trainer",
              "services": [
                "Entrenador/a personal",
                "Rutinas",
                "Online coaching",
                "Nutrición"
              ]
            },
            {
              "id": "team-coaching",
              "name": "Entrenador/a Deportivo",
              "services": [
                "Fútbol",
                "Básquet",
                "Vóley",
                "Tenis",
                "Natación",
                "Artes marciales"
              ]
            },
            {
              "id": "yoga",
              "name": "Yoga y Pilates",
              "services": [
                "Yoga",
                "Pilates",
                "Meditación",
                "Tai chi",
                "Flexibilidad"
              ]
            }
          ]
        },
        {
          "id": "outdoor",
          "name": "Aire Libre y Aventura",
          "subcategories": [
            {
              "id": "guided",
              "name": "Guiadas y Excursiones",
              "services": [
                "Guía montaña",
                "Trekking",
                "Cabalgatas",
                "Avistaje aves",
                "Ecoturismo"
              ]
            },
            {
              "id": "water",
              "name": "Deportes Acuáticos",
              "services": [
                "Buceo",
                "Kayak",
                "Kitesurf",
                "Windsurf",
                "Navegación",
                "Pesca"
              ]
            },
            {
              "id": "adventure",
              "name": "Aventura",
              "services": [
                "Escalada",
                "Rappel",
                "Tirolesa",
                "Parapente",
                "Mountain bike"
              ]
            }
          ]
        },
        {
          "id": "leisure",
          "name": "Tiempo Libre",
          "subcategories": [
            {
              "id": "recreation",
              "name": "Recreación",
              "services": [
                "Animador/a",
                "Coordinador/a recreativo",
                "Juegos",
                "Campamentos"
              ]
            },
            {
              "id": "games",
              "name": "Juegos",
              "services": [
                "Torneos",
                "Juegos rol",
                "E-sports",
                "Coordinador/a"
              ]
            }
          ]
        }
      ]
    }
  ]
};

module.exports = taxonomy;
