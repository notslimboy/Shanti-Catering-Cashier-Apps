package id.co.shanticatering.kasir;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.os.Build;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.Set;
import java.util.UUID;

@CapacitorPlugin(
    name = "NativePosPrinter",
    permissions = {
        @Permission(alias = "bluetooth", strings = { Manifest.permission.BLUETOOTH_CONNECT })
    }
)
public class NativePosPrinterPlugin extends Plugin {
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final int NETWORK_TIMEOUT_MS = 8000;

    @PluginMethod
    public void getStatus(PluginCall call) {
        BluetoothAdapter adapter = getBluetoothAdapter();
        JSObject result = new JSObject();
        result.put("available", true);
        result.put("bluetoothAvailable", adapter != null);
        result.put("bluetoothPermissionGranted", !requiresBluetoothPermission() || hasBluetoothPermission());
        result.put("networkAvailable", true);
        call.resolve(result);
    }

    @PluginMethod
    public void listBluetoothPrinters(PluginCall call) {
        if (!ensureBluetoothPermission(call, "listBluetoothPrintersPermissionCallback")) return;

        BluetoothAdapter adapter = getBluetoothAdapter();
        if (adapter == null) {
            call.reject("Bluetooth tidak tersedia di perangkat Android ini.", "BLUETOOTH_UNAVAILABLE");
            return;
        }
        if (!adapter.isEnabled()) {
            call.reject("Aktifkan Bluetooth terlebih dahulu, lalu muat ulang daftar printer.", "BLUETOOTH_DISABLED");
            return;
        }

        JSArray devices = new JSArray();
        Set<BluetoothDevice> bondedDevices = adapter.getBondedDevices();
        for (BluetoothDevice device : bondedDevices) {
            JSObject printer = new JSObject();
            printer.put("name", device.getName() == null ? "Printer Bluetooth" : device.getName());
            printer.put("address", device.getAddress());
            printer.put("bondState", device.getBondState());
            devices.put(printer);
        }

        JSObject result = new JSObject();
        result.put("devices", devices);
        call.resolve(result);
    }

    @PluginMethod
    public void printRaw(PluginCall call) {
        String transport = call.getString("transport", "bluetooth");
        if ("bluetooth".equals(transport) && !ensureBluetoothPermission(call, "printRawPermissionCallback")) return;
        startPrint(call);
    }

    @PermissionCallback
    private void listBluetoothPrintersPermissionCallback(PluginCall call) {
        if (!hasBluetoothPermission()) {
            call.reject("Izin Perangkat di Sekitar diperlukan untuk memakai printer Bluetooth.", "BLUETOOTH_PERMISSION_DENIED");
            return;
        }
        listBluetoothPrinters(call);
    }

    @PermissionCallback
    private void printRawPermissionCallback(PluginCall call) {
        if (!hasBluetoothPermission()) {
            call.reject("Izin Perangkat di Sekitar diperlukan untuk mencetak lewat Bluetooth.", "BLUETOOTH_PERMISSION_DENIED");
            return;
        }
        startPrint(call);
    }

    private boolean requiresBluetoothPermission() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S;
    }

    private boolean hasBluetoothPermission() {
        return getPermissionState("bluetooth") == PermissionState.GRANTED;
    }

    private boolean ensureBluetoothPermission(PluginCall call, String callbackName) {
        if (!requiresBluetoothPermission() || hasBluetoothPermission()) return true;
        requestPermissionForAlias("bluetooth", call, callbackName);
        return false;
    }

    private BluetoothAdapter getBluetoothAdapter() {
        BluetoothManager manager = getContext().getSystemService(BluetoothManager.class);
        return manager == null ? null : manager.getAdapter();
    }

    private void startPrint(PluginCall call) {
        final String dataBase64 = call.getString("dataBase64", "");
        final String transport = call.getString("transport", "bluetooth").trim().toLowerCase();
        if (dataBase64.isEmpty()) {
            call.reject("Data RAW ESC/POS kosong.", "EMPTY_PRINT_DATA");
            return;
        }

        final byte[] payload;
        try {
            payload = Base64.decode(dataBase64, Base64.DEFAULT);
        } catch (IllegalArgumentException error) {
            call.reject("Format data RAW ESC/POS tidak valid.", "INVALID_PRINT_DATA", error);
            return;
        }

        new Thread(() -> {
            try {
                int bytesWritten;
                if ("bluetooth".equals(transport)) {
                    bytesWritten = printBluetooth(call.getString("address", ""), payload);
                } else if ("network".equals(transport)) {
                    bytesWritten = printNetwork(
                        call.getString("host", ""),
                        call.getInt("port", 9100),
                        payload
                    );
                } else {
                    throw new IOException("Metode printer tidak didukung: " + transport);
                }

                JSObject result = new JSObject();
                result.put("success", true);
                result.put("transport", transport);
                result.put("bytesWritten", bytesWritten);
                call.resolve(result);
            } catch (Exception error) {
                call.reject(error.getMessage() == null ? "Gagal mengirim data ke printer thermal." : error.getMessage(), "PRINT_FAILED", error);
            }
        }, "kasir-pos-print").start();
    }

    private int printBluetooth(String address, byte[] payload) throws IOException {
        if (address == null || address.trim().isEmpty()) {
            throw new IOException("Pilih printer Bluetooth terlebih dahulu.");
        }

        BluetoothAdapter adapter = getBluetoothAdapter();
        if (adapter == null) throw new IOException("Bluetooth tidak tersedia di perangkat ini.");
        if (!adapter.isEnabled()) throw new IOException("Bluetooth sedang mati. Aktifkan terlebih dahulu.");

        BluetoothDevice device = adapter.getRemoteDevice(address.trim());
        try (BluetoothSocket socket = device.createRfcommSocketToServiceRecord(SPP_UUID)) {
            socket.connect();
            OutputStream output = socket.getOutputStream();
            output.write(payload);
            output.flush();
        }
        return payload.length;
    }

    private int printNetwork(String host, Integer port, byte[] payload) throws IOException {
        String safeHost = host == null ? "" : host.trim();
        int safePort = port == null ? 9100 : port;
        if (safeHost.isEmpty()) throw new IOException("Isi alamat IP printer LAN terlebih dahulu.");
        if (safePort < 1 || safePort > 65535) throw new IOException("Port printer LAN harus di antara 1 sampai 65535.");

        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(safeHost, safePort), NETWORK_TIMEOUT_MS);
            OutputStream output = socket.getOutputStream();
            output.write(payload);
            output.flush();
        }
        return payload.length;
    }
}
