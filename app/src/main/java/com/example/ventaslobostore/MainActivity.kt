package com.example.ventaslobostore

import android.os.Bundle
import android.view.Menu
import android.view.MenuItem
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.navigation.findNavController
import androidx.navigation.ui.AppBarConfiguration
import androidx.navigation.ui.navigateUp
import androidx.navigation.ui.setupActionBarWithNavController
import com.example.ventaslobostore.databinding.ActivityMainBinding
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.database.FirebaseDatabase

class MainActivity : AppCompatActivity() {
    private lateinit var appBarConfiguration: AppBarConfiguration
    private lateinit var binding: ActivityMainBinding
    private val auth by lazy { FirebaseAuth.getInstance() }
    private val database by lazy { FirebaseDatabase.getInstance().reference }
    private val prefs by lazy { getSharedPreferences("store", MODE_PRIVATE) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        ViewCompat.setOnApplyWindowInsetsListener(binding.main) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
        setSupportActionBar(binding.toolbar)
        val navController = findNavController(R.id.nav_host_fragment_content_main)
        appBarConfiguration = AppBarConfiguration(navController.graph)
        setupActionBarWithNavController(navController, appBarConfiguration)
        binding.fabAdmin.setOnClickListener { showAdminLoginDialog() }
        subscribeToNotifications(currentStoreId())
        if (auth.currentUser == null) auth.signInAnonymously()
            .addOnFailureListener { Toast.makeText(this, "No se pudo iniciar la sesión de cliente", Toast.LENGTH_LONG).show() }
        if (auth.currentUser == null) auth.signInAnonymously()
            .addOnFailureListener { Toast.makeText(this, "No se pudo iniciar la sesión de cliente", Toast.LENGTH_LONG).show() }
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        val storeItem = menu.add("Sucursal")
        storeItem.setShowAsAction(MenuItem.SHOW_AS_ACTION_ALWAYS)
        storeItem.setOnMenuItemClickListener { chooseStore(); true }
        return true
    }

    private fun currentStoreId(): String = prefs.getString("storeId", BuildConfig.MATRIX_STORE_ID) ?: BuildConfig.MATRIX_STORE_ID

    private fun chooseStore() {
        database.child("store_directory").get().addOnSuccessListener { snapshot ->
            val stores = snapshot.children.filter { it.child("active").getValue(Boolean::class.java) != false }
            val ids = stores.mapNotNull { it.key }
            if (ids.isEmpty()) { Toast.makeText(this, "No hay sucursales disponibles", Toast.LENGTH_SHORT).show(); return@addOnSuccessListener }
            val labels = stores.map { it.child("name").getValue(String::class.java) ?: it.key.orEmpty() }.toTypedArray()
            AlertDialog.Builder(this).setTitle("Selecciona una sucursal").setItems(labels) { _, index ->
                prefs.edit().putString("storeId", ids[index]).apply()
                subscribeToNotifications(ids[index])
                recreate()
            }.show()
        }.addOnFailureListener { Toast.makeText(this, "No se pudo cargar la lista de sucursales", Toast.LENGTH_LONG).show() }
    }

    private fun showAdminLoginDialog() {
        val email = EditText(this).apply { hint = "Correo del administrador"; inputType = 33 }
        val password = EditText(this).apply { hint = "Contraseña"; inputType = 129 }
        val form = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(48, 16, 48, 0); addView(email); addView(password) }
        AlertDialog.Builder(this, R.style.Theme_VENTASLOBOSTORE_Dialog)
            .setTitle("ACCESO ADMINISTRADOR").setMessage("Inicia sesión con tu cuenta de Firebase.").setView(form)
            .setPositiveButton("ENTRAR") { _, _ ->
                auth.signInWithEmailAndPassword(email.text.toString().trim(), password.text.toString())
                    .addOnSuccessListener { result -> openAuthorizedAdmin(result.user?.uid.orEmpty()) }
                    .addOnFailureListener { Toast.makeText(this, "Acceso denegado. Revisa tu cuenta y Firebase Auth.", Toast.LENGTH_LONG).show() }
            }.setNegativeButton("CANCELAR", null).show()
    }

    private fun openAuthorizedAdmin(uid: String) {
        database.child("memberships").child(uid).get().addOnSuccessListener { snapshot ->
            val allowed = snapshot.children.filter { it.child("active").getValue(Boolean::class.java) == true }.mapNotNull { it.key }
            if (allowed.isEmpty()) { Toast.makeText(this, "Tu cuenta no tiene sucursales autorizadas", Toast.LENGTH_LONG).show(); auth.signOut(); return@addOnSuccessListener }
            val directory = database.child("store_directory")
            directory.get().addOnSuccessListener { stores ->
                val labels = allowed.map { id -> stores.child(id).child("name").getValue(String::class.java) ?: id }.toTypedArray()
                val open: (Int) -> Unit = { index ->
                    val id = allowed[index]
                    startActivity(android.content.Intent(this, AdminActivity::class.java).putExtra("storeId", id))
                }
                val preferred = allowed.indexOf(currentStoreId())
                if (allowed.size == 1) open(0) else AlertDialog.Builder(this).setTitle("Elige la sucursal a administrar")
                    .setItems(labels) { _, index -> open(index) }.setOnCancelListener { if (preferred >= 0) open(preferred) }.show()
            }
        }.addOnFailureListener { Toast.makeText(this, "No se pudo validar tu acceso a sucursales", Toast.LENGTH_LONG).show() }
    }

    private fun subscribeToNotifications(storeId: String) {
        com.google.firebase.messaging.FirebaseMessaging.getInstance().subscribeToTopic("products_$storeId")
            .addOnCompleteListener { task -> if (!task.isSuccessful) android.util.Log.w("MainActivity", "No se pudo activar notificaciones para $storeId") }
    }

    override fun onSupportNavigateUp(): Boolean =
        findNavController(R.id.nav_host_fragment_content_main).navigateUp(appBarConfiguration) || super.onSupportNavigateUp()
}
