# Fixtures

## Where They Come From

All three are from the buildingSMART Certification datasets, copyright
buildingSMART International Ltd. and licensed
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Downloaded on
2026-09-09 from <https://github.com/buildingSMART/Certification-datasets>,
directory `IFC 4.0.2.1 (IFC 4 ADD2 TC1)/ISO Spec - ReferenceView_V1.2/`. They
are renamed here after what each one is for, and are otherwise unmodified.

| File                          | Original name                                | What it is for                                                                                                                                                        |
| ----------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wall_kernel_keeps_units.ifc` | `wall-with-opening-and-window.ifc`           | The one file measured so far whose geometry IfcOpenShell hands back in the file's own millimetres instead of in metres. Every other file tested comes back converted. |
| `column_in_inches.ifc`        | `column-straight-rectangle-tessellation.ifc` | Declares inches, not a metric unit at all. An 8 inch column, 10 feet tall.                                                                                            |
| `basin_at_the_origin.ifc`     | `basin-tessellation.ifc`                     | One object, at the origin, so no placement can say what the kernel did to the units. Forces the fallback.                                                             |
