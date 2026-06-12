import { db } from "./index.js";
import { users, students, lessons, payments, progress, notes, enrollments, locations } from "./schema.js";
import { hash } from "bcryptjs";
import { eq, ne, and } from "drizzle-orm";

async function seed() {
    console.log("Seeding database...");

    // Remove all data that depends on students
    await db.delete(lessons);
    await db.delete(payments);
    await db.delete(progress);
    await db.delete(notes);
    await db.delete(enrollments);
    
    // Remove all clients
    // Remove all students first because they reference users
    await db.delete(students);
    await db.delete(users).where(eq(users.role, "client"));

    // Ensure admin@student.com and student@student.com exists
    const adminPassword = await hash("admin123", 10);
    const studentPassword = await hash("student123", 10);

    // Ensure admin exists
    const adminEmail = "admin@example.com";
    let [admin] = await db.select().from(users).where(eq(users.email, adminEmail));
    if (!admin) {
        [admin] = await db.insert(users).values({
            email: adminEmail,
            passwordHash: adminPassword,
            role: "admin",
        }).returning();
    }                

    // Ensure basic student
    const studentEmail = "student@example.com";
    let [studentUser] = await db.insert(users).values({
        email: studentEmail,
        passwordHash: studentPassword,
        role: "client",
    }).returning();

    await db.insert(students).values({
        firstName: "Basic",
        lastName: "Student",
        email: studentEmail,
        userId: studentUser.id,
        status: "registered"
    });

    // Seed locations per city (only if table is empty)
    const existingLocations = await db.select().from(locations);
    if (existingLocations.length === 0) {
        await db.insert(locations).values([
            { name: "Olaines autoosta", city: "Olaine", address: "Olaine, Rīgas iela 1" },
            { name: "Olaines centrs", city: "Olaine", address: "Olaine, Centra laukums" },
            { name: "Rīgas centrālā stacija", city: "Rīga", address: "Rīga, Stacijas laukums 2" },
            { name: "Rīgas autoosta", city: "Rīga", address: "Rīga, Prāgas iela 1" },
            { name: "Jelgavas autoosta", city: "Jelgava", address: "Jelgava, Katoļu iela 18" },
            { name: "Jelgavas centrs", city: "Jelgava", address: "Jelgava, Lielā iela" },
        ]);
        console.log("Seeded default locations.");
    }

    console.log("Seeding complete.");
}

seed().catch(console.error);
