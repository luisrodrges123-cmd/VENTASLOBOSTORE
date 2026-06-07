package com.example.ventaslobostore.model

import com.google.firebase.database.Exclude
import com.google.firebase.database.IgnoreExtraProperties

@IgnoreExtraProperties
data class Order(
    @get:Exclude var id: String? = null,
    val username: String = "",
    val phone: String = "",
    val productName: String = "",
    val price: Double = 0.0,
    val imageUrl: String = "",
    val status: String = "PENDIENTE",
    val timestamp: Long = System.currentTimeMillis()
)
