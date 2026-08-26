import { db } from "./index";
import { seedIfEmpty } from "./seed-data";

seedIfEmpty(db);
console.log("Base de dados semeada com dados de demonstração (ou já continha dados).");
