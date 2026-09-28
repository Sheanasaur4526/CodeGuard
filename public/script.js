console.log("SCRIPT FILE ACTIVE");
window.testGlobal = "OK";


import { auth } from "./firebase.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

window.loginTeacher = async function () {
    const email = document.getElementById("teacherEmail").value.trim();
    const password = document.getElementById("teacherPassword").value.trim();

    try {
        await signInWithEmailAndPassword(auth, email, password);

        alert("Login successful!");
        window.location.href = "Teacher.html";

    } catch (error) {
        console.error(error);
        alert(error.message);
    }
};
